"use client";

import { useEffect, useRef, useState } from "react";

export interface ChatMessage {
  id: number;
  mine: boolean;
  text: string;
}

export default function ChatPanel({
  messages,
  connected,
  videoBusy,
  onSend,
  onStartVideo,
  onEnd,
}: {
  messages: ChatMessage[];
  connected: boolean;
  videoBusy: boolean;
  onSend: (text: string) => void;
  onStartVideo: () => void;
  onEnd: () => void;
}) {
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "auto" });
  }, [messages]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || !connected) return;
    onSend(text);
    setDraft("");
  }

  return (
    <aside className="chat-panel absolute inset-y-0 right-0 z-20 flex w-full max-w-[420px] flex-col border-l border-white/10 bg-[#0a0d0f]/97 text-zinc-100 shadow-[-24px_0_80px_rgba(0,0,0,0.28)] backdrop-blur-xl">
      <div
        className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-white/15 sm:hidden"
        aria-hidden="true"
      />
      <header className="flex min-h-[72px] items-center justify-between border-b border-white/8 px-4 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.045]">
            <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4 text-zinc-400" fill="none">
              <circle cx="10" cy="7" r="3" stroke="currentColor" strokeWidth="1.4" />
              <path d="M4.5 16c.45-3.2 2.3-4.8 5.5-4.8s5.05 1.6 5.5 4.8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
            <span
              className={`absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-[#0a0d0f] ${
                connected ? "bg-[#74e8bd]" : "bg-amber-300"
              }`}
            />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold tracking-[-0.015em]">Anonymous stranger</p>
            <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-zinc-500" aria-live="polite">
              {connected ? "Private connection active" : "Connecting…"}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
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
            className="focus-ring pressable h-9 rounded-lg border border-red-300/10 bg-red-400/10 px-3 text-xs font-medium text-red-200 hover:border-red-300/20 hover:bg-red-400/15"
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
              {connected ? "You’re connected" : "Making the connection"}
            </p>
            <p className="mt-1.5 text-xs leading-5 text-zinc-600">
              {connected
                ? "Say hello. Messages travel peer-to-peer and disappear when you leave."
                : "This usually takes just a moment."}
            </p>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.mine ? "justify-end" : "justify-start"}`}>
            <span
              className={`message-bubble max-w-[82%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-5 shadow-sm ${
                m.mine
                  ? "rounded-br-md bg-[#74e8bd] text-[#07110d]"
                  : "rounded-bl-md border border-white/8 bg-white/[0.055] text-zinc-100"
              }`}
            >
              {m.text}
            </span>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={submit}
        className="border-t border-white/8 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:px-4 sm:pb-4"
      >
        <div className="flex min-h-12 items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] p-1.5 pl-4 transition-[border-color,background-color] duration-200 focus-within:border-emerald-200/35 focus-within:bg-white/[0.055]">
          <label htmlFor="chat-message" className="sr-only">Message</label>
          <input
            id="chat-message"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={connected ? "Write a message…" : "Connecting…"}
            disabled={!connected}
            autoComplete="off"
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
