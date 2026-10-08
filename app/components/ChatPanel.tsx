"use client";

import { useEffect, useRef, useState } from "react";
import {
  CHAT_REACTIONS,
  type ChatReaction,
  type PeerReply,
} from "@/lib/webrtc";
import {
  translateText,
  type SupportedLanguage,
  SUPPORTED_TRANSLATION_LANGUAGES,
} from "@/lib/translation";


export interface ChatMessage {
  id: number;
  wireId?: string;
  mine: boolean;
  text?: string;
  system?: boolean;
  replyTo?: PeerReply;
  reactions?: {
    mine?: ChatReaction;
    peer?: ChatReaction;
  };
  attachment?: {
    name: string;
    mime: string;
    size: number;
    url: string;
  };
}

export default function ChatPanel({
  messages,
  connected,
  reconnecting,
  peerTyping,
  videoBusy,
  onSend,
  onTypingChange,
  onReact,
  onSendAttachment,
  onStartVideo,
  onSafety,
  onOpenDiagnostics,
  onEnd,
}: {
  messages: ChatMessage[];
  connected: boolean;
  reconnecting: boolean;
  peerTyping: boolean;
  videoBusy: boolean;
  onSend: (text: string, replyTo?: PeerReply) => boolean;
  onTypingChange: (active: boolean) => void;
  onReact: (messageId: string, reaction: ChatReaction | null) => void;
  onSendAttachment: (file: File) => Promise<boolean>;
  onStartVideo: () => void;
  onSafety: () => void;
  onOpenDiagnostics?: () => void;
  onEnd: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [recording, setRecording] = useState(false);
  const [sendingFile, setSendingFile] = useState(false);
  const [composerError, setComposerError] = useState<string | null>(null);
  const [replyTarget, setReplyTarget] = useState<ChatMessage | null>(null);
  const [reactionTargetId, setReactionTargetId] = useState<number | null>(null);
  const [translateEnabled, setTranslateEnabled] = useState(false);
  const [targetLang, setTargetLang] = useState<SupportedLanguage>("en");
  const [translations, setTranslations] = useState<
    Record<string, { translated: string; original: string; showOriginal: boolean }>
  >({});
  const endRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSentAtRef = useRef(0);
  const onTypingChangeRef = useRef(onTypingChange);
  onTypingChangeRef.current = onTypingChange;

  useEffect(() => {
    if (!translateEnabled) return;
    const untranslated = messages.filter(
      (m) => !m.mine && !m.system && m.text && m.wireId && !translations[m.wireId],
    );
    if (untranslated.length === 0) return;

    for (const msg of untranslated) {
      if (!msg.text || !msg.wireId) continue;
      const wireId = msg.wireId;
      const textToTranslate = msg.text;
      void translateText(textToTranslate, targetLang).then((res) => {
        setTranslations((prev) => ({
          ...prev,
          [wireId]: {
            translated: res.translatedText,
            original: textToTranslate,
            showOriginal: false,
          },
        }));
      });
    }
  }, [messages, translateEnabled, targetLang, translations]);

  function cycleTranslation() {
    if (!translateEnabled) {
      setTranslateEnabled(true);
      setTargetLang("en");
    } else if (targetLang === "en") {
      setTargetLang("fil");
    } else if (targetLang === "fil") {
      setTargetLang("es");
    } else if (targetLang === "es") {
      setTargetLang("ja");
    } else {
      setTranslateEnabled(false);
    }
  }


  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "auto" });
  }, [messages, peerTyping]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || !connected) return;
    const replyTo = replyTarget ? toPeerReply(replyTarget) : undefined;
    if (!onSend(text, replyTo)) return;
    setDraft("");
    setReplyTarget(null);
    stopTyping();
  }

  function stopTyping() {
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = null;
    lastTypingSentAtRef.current = 0;
    onTypingChangeRef.current(false);
  }

  function updateDraft(value: string) {
    setDraft(value);
    if (!connected || !value.trim()) {
      stopTyping();
      return;
    }

    const now = Date.now();
    if (now - lastTypingSentAtRef.current >= 1_200) {
      onTypingChangeRef.current(true);
      lastTypingSentAtRef.current = now;
    }
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(stopTyping, 1_600);
  }

  async function sendFile(file: File) {
    setComposerError(null);
    setSendingFile(true);
    try {
      const sent = await onSendAttachment(file);
      if (!sent) setComposerError("File could not be sent. Maximum size is 8 MB.");
    } catch {
      setComposerError("File could not be sent. Please try again.");
    } finally {
      setSendingFile(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function toggleRecording() {
    if (recording) {
      recorderRef.current?.stop();
      if (recordingTimerRef.current) clearTimeout(recordingTimerRef.current);
      recordingTimerRef.current = null;
      setRecording(false);
      return;
    }

    setComposerError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      recordingStreamRef.current = stream;
      recordingChunksRef.current = [];
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) recordingChunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const mime = recorder.mimeType || "audio/webm";
        const blob = new Blob(recordingChunksRef.current, { type: mime });
        recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
        recordingStreamRef.current = null;
        recorderRef.current = null;
        if (blob.size > 0) {
          const extension = mime.includes("ogg") ? "ogg" : "webm";
          void sendFile(
            new File([blob], `voice-${Date.now()}.${extension}`, { type: mime }),
          );
        }
      };
      recorder.start();
      recordingTimerRef.current = setTimeout(() => {
        if (recorder.state !== "inactive") recorder.stop();
        setRecording(false);
        recordingTimerRef.current = null;
      }, 60_000);
      setRecording(true);
    } catch {
      setComposerError("Microphone access is needed to record a voice message.");
    }
  }

  useEffect(() => {
    return () => {
      const recorder = recorderRef.current;
      if (recorder) recorder.onstop = null;
      if (recorder && recorder.state !== "inactive") recorder.stop();
      if (recordingTimerRef.current) clearTimeout(recordingTimerRef.current);
      recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      onTypingChangeRef.current(false);
    };
  }, []);

  return (
    <aside className="chat-panel absolute inset-y-0 right-0 z-20 flex w-full max-w-[420px] flex-col border-l border-white/10 bg-[#0a0d0f]/97 text-zinc-100 shadow-[-24px_0_80px_rgba(0,0,0,0.28)] backdrop-blur-xl">
      <div
        className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-white/15 sm:hidden"
        aria-hidden="true"
      />
      <header className="flex min-h-[64px] sm:min-h-[72px] items-center justify-between gap-2 border-b border-white/8 px-3.5 sm:px-5">
        <div className="flex min-w-0 flex-1 items-center gap-2.5 sm:gap-3">
          <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.045]">
            <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4 text-zinc-400" fill="none">
              <circle cx="10" cy="7" r="3" stroke="currentColor" strokeWidth="1.4" />
              <path d="M4.5 16c.45-3.2 2.3-4.8 5.5-4.8s5.05 1.6 5.5 4.8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
            <div
              className={`absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-[#0a0d0f] ${
                connected ? "bg-[#74e8bd]" : "bg-amber-300"
              }`}
            />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs sm:text-sm font-semibold tracking-[-0.015em] text-zinc-100">
              Anonymous stranger
            </p>
            <p className="mt-0.5 truncate text-[10px] sm:text-[11px] text-zinc-500" aria-live="polite">
              {connected
                ? "Private connection active"
                : reconnecting
                  ? "Reconnecting…"
                  : "Connecting…"}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <button
            onClick={onSafety}
            aria-label="Open safety options"
            title="Safety options"
            className="focus-ring pressable flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.035] text-zinc-400 hover:border-red-200/20 hover:bg-red-300/[0.07] hover:text-red-200"
          >
            <svg aria-hidden="true" viewBox="0 0 18 18" className="h-4 w-4" fill="none">
              <path d="M9 2 14.5 4.4v4.05c0 3.35-2.3 5.85-5.5 7.1-3.2-1.25-5.5-3.75-5.5-7.1V4.4L9 2Z" stroke="currentColor" strokeWidth="1.3" />
              <path d="M9 5.4v4.1m0 2.4v.1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </button>
          {onOpenDiagnostics && (
            <button
              onClick={onOpenDiagnostics}
              aria-label="Connection diagnostics and TURN"
              title="Connection & TURN diagnostics"
              className="focus-ring pressable hidden sm:flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.035] text-zinc-400 hover:border-[#74e8bd]/40 hover:bg-[#74e8bd]/10 hover:text-[#74e8bd]"
            >
              <svg aria-hidden="true" viewBox="0 0 18 18" className="h-4 w-4" fill="none">
                <path d="M2.5 12h2.5l2-6 3 9 2-5h3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
          <button
            type="button"
            onClick={cycleTranslation}
            aria-label="Live translation toggle"
            title={
              translateEnabled
                ? `Translating to ${SUPPORTED_TRANSLATION_LANGUAGES[targetLang].label} (Click to cycle)`
                : "Enable live translation"
            }
            className={`focus-ring pressable flex h-9 w-9 sm:w-auto items-center justify-center sm:justify-start sm:gap-1.5 rounded-lg border p-0 sm:px-2.5 text-xs font-medium transition ${
              translateEnabled
                ? "border-cyan-500/40 bg-cyan-500/15 text-cyan-300"
                : "border-white/10 bg-white/[0.035] text-zinc-400 hover:text-white"
            }`}
          >
            <span className="text-sm">🌐</span>
            <span className="hidden sm:inline">
              {translateEnabled
                ? `${SUPPORTED_TRANSLATION_LANGUAGES[targetLang].flag} ${targetLang.toUpperCase()}`
                : "Translate"}
            </span>
          </button>

          <button
            onClick={onStartVideo}
            disabled={!connected || videoBusy}
            aria-label="Start video call"
            title="Start video call"
            className="focus-ring pressable flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.035] text-zinc-300 hover:border-white/20 hover:bg-white/[0.065] disabled:cursor-not-allowed disabled:opacity-35"
          >
            <svg aria-hidden="true" viewBox="0 0 18 18" className="h-4 w-4" fill="none">
              <rect x="2.5" y="4" width="9" height="10" rx="2" stroke="currentColor" strokeWidth="1.3" />
              <path d="m11.5 7 4-2v8l-4-2V7Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
            </svg>
          </button>
          <button
            onClick={onEnd}
            className="focus-ring pressable h-9 rounded-lg border border-red-300/10 bg-red-400/10 px-2.5 sm:px-3 text-xs font-medium text-red-200 hover:border-red-300/20 hover:bg-red-400/15"
          >
            Leave
          </button>
        </div>
      </header>

      <div className="chat-scroll flex-1 space-y-2 overflow-y-auto px-4 py-5 sm:px-5">
        {messages.length === 0 && (
          <div className="mx-auto mt-7 max-w-[260px] text-center sm:mt-14">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full border border-white/8 bg-white/[0.03] text-zinc-500">
              <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="none">
                <path d="M4 3.5h12a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H9l-4.5 3v-3H4a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
              </svg>
            </div>
            <p className="mt-3 text-sm font-medium text-zinc-300">
              {connected
                ? "You’re connected"
                : reconnecting
                  ? "Restoring your connection"
                  : "Making the connection"}
            </p>
            <p className="mt-1.5 text-xs leading-5 text-zinc-600">
              {connected
                ? "Say hello. Messages travel peer-to-peer and disappear when you leave."
                : reconnecting
                  ? "Your conversation will stay here while Pulse retries."
                  : "This usually takes just a moment."}
            </p>
          </div>
        )}
        {messages.map((m) => m.system ? (
          <div key={m.id} className="flex justify-center py-2">
            <p className="rounded-full border border-white/8 bg-white/[0.035] px-3 py-1.5 text-center font-mono text-[9px] uppercase tracking-[0.12em] text-zinc-500">
              {m.text}
            </p>
          </div>
        ) : (
          <div key={m.id} className={`group flex ${m.mine ? "justify-end" : "justify-start"}`}>
            <div className={`relative max-w-[86%] ${m.mine ? "items-end" : "items-start"}`}>
              <div
                className={`message-bubble rounded-2xl px-3.5 py-2.5 text-[13px] leading-5 shadow-sm ${
                  m.mine
                    ? "rounded-br-md bg-[#74e8bd] text-[#07110d]"
                    : "rounded-bl-md border border-white/8 bg-white/[0.055] text-zinc-100"
                }`}
              >
                {m.replyTo && <ReplyPreview reply={m.replyTo} />}
                {m.attachment ? (
                  <AttachmentMessage attachment={m.attachment} />
                ) : translations[m.wireId ?? ""] && !translations[m.wireId ?? ""].showOriginal ? (
                  <div>
                    <p>{translations[m.wireId ?? ""].translated}</p>
                    <button
                      type="button"
                      onClick={() =>
                        setTranslations((prev) => ({
                          ...prev,
                          [m.wireId!]: { ...prev[m.wireId!], showOriginal: true },
                        }))
                      }
                      className="mt-1 block text-[10px] text-cyan-300/80 underline decoration-cyan-300/40 hover:text-cyan-200"
                    >
                      🌐 Translated ({targetLang.toUpperCase()}) • Show original
                    </button>
                  </div>
                ) : (
                  <div>
                    <p>{m.text}</p>
                    {translations[m.wireId ?? ""] && (
                      <button
                        type="button"
                        onClick={() =>
                          setTranslations((prev) => ({
                            ...prev,
                            [m.wireId!]: { ...prev[m.wireId!], showOriginal: false },
                          }))
                        }
                        className="mt-1 block text-[10px] text-zinc-400 underline decoration-zinc-500/40 hover:text-zinc-200"
                      >
                        🌐 Show translation
                      </button>
                    )}
                  </div>
                )}
              </div>

              {m.reactions && <ReactionSummary reactions={m.reactions} mine={m.mine} />}
              {m.wireId && (
                <div className={`mt-1 flex items-center gap-1 ${m.mine ? "justify-end" : "justify-start"}`}>
                  <button
                    type="button"
                    onClick={() => {
                      setReplyTarget(m);
                      setReactionTargetId(null);
                    }}
                    className="focus-ring pressable rounded-md px-1.5 py-1 text-[10px] text-zinc-600 hover:bg-white/6 hover:text-zinc-300 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
                    aria-label="Reply to message"
                  >
                    Reply
                  </button>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setReactionTargetId((current) => current === m.id ? null : m.id)}
                      className="focus-ring pressable rounded-md px-1.5 py-1 text-[12px] text-zinc-600 hover:bg-white/6 hover:text-zinc-300 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
                      aria-label="React to message"
                      aria-expanded={reactionTargetId === m.id}
                    >
                      ☺
                    </button>
                    {reactionTargetId === m.id && (
                      <div className={`ui-enter-fast absolute bottom-full z-10 mb-1 flex gap-0.5 rounded-xl border border-white/10 bg-[#101416] p-1 shadow-[0_12px_36px_rgba(0,0,0,0.42)] ${m.mine ? "right-0 origin-bottom-right" : "left-0 origin-bottom-left"}`}>
                        {(Object.entries(CHAT_REACTIONS) as Array<[ChatReaction, string]>).map(([reaction, emoji]) => (
                          <button
                            key={reaction}
                            type="button"
                            onClick={() => {
                              onReact(m.wireId!, m.reactions?.mine === reaction ? null : reaction);
                              setReactionTargetId(null);
                            }}
                            aria-label={`React with ${reaction}`}
                            aria-pressed={m.reactions?.mine === reaction}
                            className={`focus-ring pressable grid h-9 w-9 place-items-center rounded-lg text-base ${m.reactions?.mine === reaction ? "bg-emerald-300/12" : "hover:bg-white/8"}`}
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
        {peerTyping && (
          <div className="flex items-center gap-2 px-1 py-1 text-[11px] text-zinc-500" role="status" aria-live="polite">
            <span className="typing-dots" aria-hidden="true"><i /><i /><i /></span>
            Stranger is typing
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={submit}
        className="border-t border-white/8 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:px-4 sm:pb-4"
      >
        {composerError && (
          <p role="alert" className="mb-2 px-1 text-[11px] text-red-300">
            {composerError}
          </p>
        )}
        {replyTarget && (
          <div className="ui-enter-fast mb-2 flex items-center gap-2 rounded-xl border border-white/8 bg-white/[0.035] px-3 py-2">
            <div className="min-w-0 flex-1 border-l-2 border-[#74e8bd]/70 pl-2.5">
              <p className="text-[10px] font-medium text-emerald-200">Replying to {replyTarget.mine ? "your message" : "stranger"}</p>
              <p className="mt-0.5 truncate text-[11px] text-zinc-500">{getMessagePreview(replyTarget)}</p>
            </div>
            <button type="button" onClick={() => setReplyTarget(null)} className="focus-ring pressable grid h-7 w-7 place-items-center rounded-lg text-zinc-500 hover:bg-white/7 hover:text-zinc-200" aria-label="Cancel reply">×</button>
          </div>
        )}
        <input
          ref={fileRef}
          type="file"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void sendFile(file);
          }}
        />
        <div className="flex min-h-12 items-center gap-1.5 rounded-2xl border border-white/10 bg-white/[0.04] p-1.5 pl-2 transition-[border-color,background-color] duration-200 focus-within:border-emerald-200/35 focus-within:bg-white/[0.055]">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={!connected || sendingFile || recording}
            aria-label="Send a file"
            title="Send image, video, or file"
            className="focus-ring pressable flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-zinc-400 hover:bg-white/7 hover:text-zinc-100 disabled:opacity-35"
          >
            <AttachmentIcon />
          </button>
          <button
            type="button"
            onClick={() => void toggleRecording()}
            disabled={!connected || sendingFile}
            aria-label={recording ? "Stop voice recording" : "Record a voice message"}
            title={recording ? "Stop recording" : "Voice message"}
            className={`focus-ring pressable flex h-9 w-9 shrink-0 items-center justify-center rounded-xl hover:bg-white/7 disabled:opacity-35 ${
              recording ? "bg-red-400/12 text-red-300" : "text-zinc-400 hover:text-zinc-100"
            }`}
          >
            {recording ? <StopIcon /> : <MicrophoneIcon />}
          </button>
          <label htmlFor="chat-message" className="sr-only">Message</label>
          <input
            id="chat-message"
            value={draft}
            onChange={(e) => updateDraft(e.target.value)}
            onBlur={stopTyping}
            placeholder={
              recording
                ? "Recording voice…"
                : sendingFile
                  ? "Sending file…"
                  : connected
                    ? "Write a message…"
                    : "Connecting…"
            }
            disabled={!connected || recording || sendingFile}
            autoComplete="off"
            maxLength={2000}
            className="min-w-0 flex-1 bg-transparent text-[13px] text-zinc-100 outline-none placeholder:text-zinc-600 disabled:cursor-not-allowed"
          />
          <button
            type="submit"
            disabled={!connected || !draft.trim()}
            aria-label="Send message"
            className="focus-ring pressable flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#74e8bd] text-[#07110d] hover:bg-[#8df0c9] disabled:cursor-not-allowed disabled:bg-white/7 disabled:text-zinc-600"
          >
            <svg aria-hidden="true" viewBox="0 0 18 18" className="h-4 w-4" fill="none">
              <path d="m3 9 11-5-3.7 10-2.1-3.2L3 9Z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              <path d="m8.2 10.8 2.2-2.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </form>
    </aside>
  );
}

function toPeerReply(message: ChatMessage): PeerReply | undefined {
  if (!message.wireId) return undefined;
  return {
    messageId: message.wireId,
    preview: getMessagePreview(message),
    mine: message.mine,
  };
}

function getMessagePreview(message: ChatMessage): string {
  const preview = message.text?.trim() || message.attachment?.name || "Message";
  return preview.length > 120 ? `${preview.slice(0, 117)}…` : preview;
}

function ReplyPreview({ reply }: { reply: PeerReply }) {
  return (
    <div className="mb-2 border-l-2 border-current/35 pl-2 text-[10px] leading-4 opacity-70">
      <span className="block font-semibold opacity-85">
        {reply.mine ? "You" : "Stranger"}
      </span>
      <span className="block max-w-full truncate">{reply.preview}</span>
    </div>
  );
}

function ReactionSummary({
  reactions,
  mine,
}: {
  reactions: NonNullable<ChatMessage["reactions"]>;
  mine: boolean;
}) {
  const counts = new Map<ChatReaction, number>();
  if (reactions.mine) counts.set(reactions.mine, 1);
  if (reactions.peer) counts.set(reactions.peer, (counts.get(reactions.peer) ?? 0) + 1);
  if (counts.size === 0) return null;

  return (
    <div className={`-mt-1 flex gap-1 ${mine ? "justify-end pr-1" : "justify-start pl-1"}`}>
      {[...counts].map(([reaction, count]) => (
        <span key={reaction} className="rounded-full border border-white/10 bg-[#101416] px-1.5 py-0.5 text-[10px] text-zinc-300 shadow-sm">
          {CHAT_REACTIONS[reaction]}{count > 1 ? ` ${count}` : ""}
        </span>
      ))}
    </div>
  );
}

function AttachmentMessage({
  attachment,
}: {
  attachment: NonNullable<ChatMessage["attachment"]>;
}) {
  if (
    ["image/jpeg", "image/png", "image/gif", "image/webp", "image/avif"].includes(
      attachment.mime,
    )
  ) {
    return (
      <a href={attachment.url} download={attachment.name} className="block">
        {/* Blob URLs are peer-provided ephemeral media, not optimizable assets. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={attachment.url}
          alt={attachment.name}
          className="max-h-56 w-full rounded-xl object-cover"
        />
        <span className="mt-1.5 block truncate text-[11px] opacity-70">
          {attachment.name}
        </span>
      </a>
    );
  }

  if (attachment.mime.startsWith("video/")) {
    return (
      <div className="min-w-[220px]">
        <video src={attachment.url} controls playsInline className="max-h-56 w-full rounded-xl" />
        <a href={attachment.url} download={attachment.name} className="mt-1.5 block truncate text-[11px] underline decoration-current/30 underline-offset-2">
          {attachment.name}
        </a>
      </div>
    );
  }

  if (attachment.mime.startsWith("audio/")) {
    return (
      <div className="min-w-[220px]">
        <audio src={attachment.url} controls className="h-9 w-full" />
        <span className="mt-1 block truncate text-[10px] opacity-65">Voice message</span>
      </div>
    );
  }

  return (
    <a
      href={attachment.url}
      download={attachment.name}
      className="flex min-w-[190px] items-center gap-3"
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-current/15 bg-black/8">
        <AttachmentIcon />
      </span>
      <span className="min-w-0">
        <span className="block truncate font-medium">{attachment.name}</span>
        <span className="block text-[10px] opacity-60">{formatBytes(attachment.size)}</span>
      </span>
    </a>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function AttachmentIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 18 18" className="h-4 w-4" fill="none">
      <path d="m6.4 9.9 4.85-4.85a2.15 2.15 0 1 1 3.04 3.04l-6.2 6.2a3.55 3.55 0 0 1-5.02-5.02l6.1-6.1" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
    </svg>
  );
}

function MicrophoneIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 18 18" className="h-4 w-4" fill="none">
      <rect x="6" y="2" width="6" height="9" rx="3" stroke="currentColor" strokeWidth="1.35" />
      <path d="M3.75 8.5a5.25 5.25 0 0 0 10.5 0M9 13.75V16m-2.5 0h5" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
    </svg>
  );
}

function StopIcon() {
  return <span aria-hidden="true" className="h-3 w-3 rounded-[3px] bg-current" />;
}
