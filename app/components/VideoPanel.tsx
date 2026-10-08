"use client";

import { useEffect, useRef, useState } from "react";
import { LANGUAGE_DETAILS, type SessionLanguage } from "@/lib/language";
import { translateText, type SupportedLanguage } from "@/lib/translation";


type DeviceKind = "audioinput" | "videoinput";

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: { transcript: string };
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

export default function VideoPanel({
  localStream,
  remoteStream,
  microphoneEnabled,
  cameraEnabled,
  sharingScreen,
  callStartedAt,
  language,
  remoteCaption,
  onCaption,
  onSelectDevice,
  onToggleMicrophone,
  onToggleCamera,
  onToggleScreenShare,
  onOpenDiagnostics,
  onEnd,
}: {
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  microphoneEnabled: boolean;
  cameraEnabled: boolean;
  sharingScreen: boolean;
  callStartedAt: number;
  language: SessionLanguage;
  remoteCaption: string;
  onCaption: (text: string, final: boolean) => void;
  onSelectDevice: (kind: DeviceKind, deviceId: string) => Promise<void>;
  onToggleMicrophone: () => void;
  onToggleCamera: () => void;
  onToggleScreenShare: () => void;
  onOpenDiagnostics?: () => void;
  onEnd: () => void;
}) {
  const localRef = useRef<HTMLVideoElement>(null);
  const remoteRef = useRef<HTMLVideoElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const captionsEnabledRef = useRef(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(() =>
    Math.max(0, Math.floor((Date.now() - callStartedAt) / 1_000)),
  );
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceMenuOpen, setDeviceMenuOpen] = useState(false);
  const [captionsEnabled, setCaptionsEnabled] = useState(false);
  const [localCaption, setLocalCaption] = useState("");
  const [pictureInPicture, setPictureInPicture] = useState(false);
  const [translateCaptions, setTranslateCaptions] = useState(false);
  const [translatedRemoteCaption, setTranslatedRemoteCaption] = useState("");

  const speechRecognition = getSpeechRecognition();
  const pictureInPictureSupported =
    typeof document !== "undefined" &&
    document.pictureInPictureEnabled &&
    typeof HTMLVideoElement !== "undefined" &&
    "requestPictureInPicture" in HTMLVideoElement.prototype;

  useEffect(() => {
    if (!translateCaptions || !remoteCaption?.trim()) return;
    let cancelled = false;
    const target = (language as SupportedLanguage) || "en";
    void translateText(remoteCaption.trim(), target).then((res) => {
      if (!cancelled) {
        setTranslatedRemoteCaption(res.translatedText);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [translateCaptions, remoteCaption, language]);



  useEffect(() => {
    const timer = window.setInterval(() => {
      setElapsedSeconds(
        Math.max(0, Math.floor((Date.now() - callStartedAt) / 1_000)),
      );
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [callStartedAt]);

  useEffect(() => {
    if (localRef.current && localRef.current.srcObject !== localStream) {
      localRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteRef.current && remoteRef.current.srcObject !== remoteStream) {
      remoteRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  useEffect(() => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    let active = true;
    const refresh = () => {
      void navigator.mediaDevices.enumerateDevices().then((next) => {
        if (active) {
          setDevices(next.filter((device) => device.kind !== "audiooutput"));
        }
      });
    };
    refresh();
    navigator.mediaDevices.addEventListener?.("devicechange", refresh);
    return () => {
      active = false;
      navigator.mediaDevices.removeEventListener?.("devicechange", refresh);
    };
  }, [localStream]);

  useEffect(() => {
    const video = remoteRef.current;
    if (!video) return;
    const entered = () => setPictureInPicture(true);
    const left = () => setPictureInPicture(false);
    video.addEventListener("enterpictureinpicture", entered);
    video.addEventListener("leavepictureinpicture", left);
    return () => {
      video.removeEventListener("enterpictureinpicture", entered);
      video.removeEventListener("leavepictureinpicture", left);
    };
  }, [remoteStream]);

  useEffect(() => {
    return () => {
      captionsEnabledRef.current = false;
      recognitionRef.current?.abort();
      recognitionRef.current = null;
    };
  }, []);

  function startCaptions() {
    if (!speechRecognition) return;
    const recognition = new speechRecognition();
    recognition.lang = LANGUAGE_DETAILS[language].speechTag;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onresult = (event) => {
      let text = "";
      let final = false;
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        text += result[0]?.transcript ?? "";
        final ||= result.isFinal;
      }
      const caption = text.trim();
      if (!caption) return;
      setLocalCaption(caption);
      onCaption(caption, final);
    };
    recognition.onerror = () => {
      captionsEnabledRef.current = false;
      setCaptionsEnabled(false);
    };
    recognition.onend = () => {
      if (!captionsEnabledRef.current) return;
      try {
        recognition.start();
      } catch {
        captionsEnabledRef.current = false;
        setCaptionsEnabled(false);
      }
    };
    recognitionRef.current = recognition;
    captionsEnabledRef.current = true;
    setCaptionsEnabled(true);
    try {
      recognition.start();
    } catch {
      captionsEnabledRef.current = false;
      setCaptionsEnabled(false);
    }
  }

  function toggleCaptions() {
    if (captionsEnabled) {
      captionsEnabledRef.current = false;
      recognitionRef.current?.stop();
      recognitionRef.current = null;
      setCaptionsEnabled(false);
      setLocalCaption("");
      return;
    }
    startCaptions();
  }

  async function togglePictureInPicture() {
    const video = remoteRef.current;
    if (!pictureInPictureSupported || !video || !remoteStream) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else {
        await video.requestPictureInPicture();
      }
    } catch {
      // The browser can reject PiP while remote video metadata is not ready.
    }
  }

  const microphoneId =
    localStream?.getAudioTracks()[0]?.getSettings().deviceId ?? "";
  const cameraId =
    localStream?.getVideoTracks()[0]?.getSettings().deviceId ?? "";
  const microphones = devices.filter((device) => device.kind === "audioinput");
  const cameras = devices.filter((device) => device.kind === "videoinput");

  return (
    <section
      aria-label="Video call"
      className="video-stage fixed inset-0 z-50 flex min-h-[100dvh] flex-col bg-[#050708] text-zinc-100"
    >
      <header className="absolute inset-x-0 top-0 z-10 flex items-center justify-between bg-gradient-to-b from-black/70 to-transparent p-4 pt-[max(1rem,env(safe-area-inset-top))] sm:p-6">
        <div className="flex items-center gap-2.5">
          <span className="h-2 w-2 rounded-full bg-[#74e8bd] shadow-[0_0_12px_rgba(116,232,189,0.65)]" />
          <div>
            <p className="text-sm font-medium">Anonymous call</p>
            <p className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.16em] text-zinc-500">
              {formatElapsed(elapsedSeconds)} · {LANGUAGE_DETAILS[language].nativeLabel}
            </p>
          </div>
        </div>
      </header>

      <div className="relative flex-1 overflow-hidden">
        <video
          ref={remoteRef}
          autoPlay
          playsInline
          className="h-full w-full bg-[#0a0d0f] object-cover"
        />
        {!remoteStream && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <div className="waiting-orbit relative" aria-hidden="true" />
            <p className="mt-5 text-sm font-medium text-zinc-300">
              Waiting for their camera
            </p>
            <p className="mt-1.5 text-xs text-zinc-600">
              The connection is already private.
            </p>
          </div>
        )}
        <video
          ref={localRef}
          autoPlay
          playsInline
          muted
          aria-label="Your camera preview"
          className="absolute bottom-36 right-3 h-36 w-24 rounded-2xl border border-white/15 bg-[#111719] object-cover shadow-[0_16px_50px_rgba(0,0,0,0.45)] sm:bottom-6 sm:right-6 sm:h-44 sm:w-32"
        />
        {!cameraEnabled && !sharingScreen && (
          <div className="absolute bottom-36 right-3 grid h-36 w-24 place-items-center rounded-2xl border border-white/10 bg-[#111719] text-[10px] font-medium text-zinc-500 sm:bottom-6 sm:right-6 sm:h-44 sm:w-32">
            Camera off
          </div>
        )}

        {(remoteCaption || localCaption) && (
          <div className="pointer-events-none absolute inset-x-4 bottom-40 z-10 mx-auto flex max-w-2xl flex-col items-center gap-1 text-center sm:bottom-8">
            {remoteCaption && (
              <p className="rounded-lg bg-black/75 px-3 py-1.5 text-sm leading-5 text-white shadow-lg">
                <span className="mr-1.5 text-[10px] uppercase tracking-wider text-emerald-200">
                  {translateCaptions ? "Stranger (Translated)" : "Stranger"}
                </span>
                {translateCaptions && translatedRemoteCaption
                  ? translatedRemoteCaption
                  : remoteCaption}
              </p>
            )}
            {localCaption && captionsEnabled && (
              <p className="rounded-md bg-black/55 px-2.5 py-1 text-xs text-zinc-300">
                <span className="mr-1.5 text-[9px] uppercase tracking-wider text-zinc-500">You</span>
                {localCaption}
              </p>
            )}
          </div>
        )}


        {deviceMenuOpen && (
          <div className="ui-enter-fast absolute bottom-40 left-1/2 z-20 w-[min(92vw,360px)] -translate-x-1/2 rounded-2xl border border-white/10 bg-[#101416]/98 p-3 shadow-[0_18px_60px_rgba(0,0,0,0.55)] backdrop-blur-xl sm:bottom-20">
            <div className="flex items-center justify-between px-1 pb-2">
              <p className="text-xs font-semibold text-zinc-200">Call devices</p>
              <button
                type="button"
                onClick={() => setDeviceMenuOpen(false)}
                className="focus-ring pressable grid h-7 w-7 place-items-center rounded-lg text-zinc-500 hover:bg-white/7 hover:text-zinc-200"
                aria-label="Close device menu"
              >
                ×
              </button>
            </div>
            <DeviceSelect
              label="Microphone"
              value={microphoneId}
              devices={microphones}
              onChange={(id) => onSelectDevice("audioinput", id)}
            />
            <DeviceSelect
              label="Camera"
              value={cameraId}
              devices={cameras}
              disabled={sharingScreen}
              onChange={(id) => onSelectDevice("videoinput", id)}
            />
            <p className="mt-3 px-1 text-[10px] leading-4 text-zinc-600">
              Live captions are opt-in and may use your browser&apos;s speech
              service. Caption text is sent only to the connected peer.
            </p>
          </div>
        )}
      </div>

      <div className="absolute inset-x-0 bottom-0 z-10 flex flex-wrap justify-center gap-2 bg-gradient-to-t from-black/80 to-transparent px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-10 sm:gap-3 sm:pb-6">
        <CallControl label={microphoneEnabled ? "Mute" : "Unmute"} active={!microphoneEnabled} onClick={onToggleMicrophone} icon={microphoneEnabled ? "mic" : "mic-off"} />
        <CallControl label={cameraEnabled ? "Camera off" : "Camera on"} active={!cameraEnabled} onClick={onToggleCamera} icon={cameraEnabled ? "camera" : "camera-off"} />
        <CallControl label={sharingScreen ? "Stop sharing" : "Share screen"} active={sharingScreen} onClick={onToggleScreenShare} icon="screen" />
        <CallControl label="Choose camera or microphone" active={deviceMenuOpen} onClick={() => setDeviceMenuOpen((open) => !open)} icon="devices" />
        <CallControl label={speechRecognition ? (captionsEnabled ? "Turn captions off" : "Turn captions on") : "Live captions unavailable in this browser"} active={captionsEnabled} disabled={!speechRecognition} onClick={toggleCaptions} icon="captions" />
        <CallControl label={translateCaptions ? "Disable caption translation" : `Translate captions to ${language.toUpperCase()}`} active={translateCaptions} onClick={() => setTranslateCaptions((prev) => !prev)} icon="translate" />
        <CallControl label={pictureInPicture ? "Exit Picture-in-Picture" : "Picture-in-Picture"} active={pictureInPicture} disabled={!pictureInPictureSupported || !remoteStream} onClick={() => void togglePictureInPicture()} icon="pip" />
        {onOpenDiagnostics && (
          <CallControl label="Connection & TURN diagnostics" active={false} onClick={onOpenDiagnostics} icon="diagnostics" />
        )}
        <button
          onClick={onEnd}
          aria-label="End video call"
          title="End call"
          className="focus-ring pressable flex h-12 w-12 items-center justify-center rounded-full border border-red-200/15 bg-red-500 text-white shadow-[0_12px_35px_rgba(239,68,68,0.18)] hover:bg-red-400"
        >
          <svg aria-hidden="true" viewBox="0 0 18 18" className="h-4 w-4" fill="none">
            <path d="M3.5 7.5c3.5-2.3 7.5-2.3 11 0l-1.25 3-2.15-.9.2-1.35a7.9 7.9 0 0 0-4.6 0l.2 1.35-2.15.9-1.25-3Z" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </section>
  );
}

function DeviceSelect({
  label,
  value,
  devices,
  disabled = false,
  onChange,
}: {
  label: string;
  value: string;
  devices: MediaDeviceInfo[];
  disabled?: boolean;
  onChange: (deviceId: string) => Promise<void>;
}) {
  return (
    <label className="mt-2 block text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-500">
      {label}
      <select
        value={value}
        disabled={disabled || devices.length === 0}
        onChange={(event) => void onChange(event.target.value)}
        className="focus-ring mt-1.5 min-h-10 w-full rounded-xl border border-white/10 bg-[#090c0e] px-3 text-xs normal-case tracking-normal text-zinc-200 outline-none disabled:opacity-40"
      >
        {devices.length === 0 && <option value="">Unavailable</option>}
        {devices.map((device, index) => (
          <option key={device.deviceId} value={device.deviceId}>
            {device.label || `${label} ${index + 1}`}
          </option>
        ))}
      </select>
    </label>
  );
}

type CallIconKind =
  | "mic"
  | "mic-off"
  | "camera"
  | "camera-off"
  | "screen"
  | "devices"
  | "captions"
  | "translate"
  | "pip"
  | "diagnostics";

function CallControl({
  label,
  active,
  disabled = false,
  onClick,
  icon,
}: {
  label: string;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  icon: CallIconKind;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`focus-ring pressable flex h-12 w-12 items-center justify-center rounded-full border text-zinc-100 disabled:cursor-not-allowed disabled:opacity-30 ${
        active
          ? "border-white/18 bg-white/18"
          : "border-white/10 bg-black/45 hover:bg-white/12"
      }`}
    >
      <CallIcon kind={icon} />
    </button>
  );
}

function CallIcon({ kind }: { kind: CallIconKind }) {
  if (kind === "translate") {
    return (
      <svg aria-hidden="true" viewBox="0 0 20 20" className="h-5 w-5" fill="none">
        <circle cx="10" cy="10" r="7.5" stroke="currentColor" strokeWidth="1.3" />
        <path d="M2.5 10h15M10 2.5a11 11 0 0 1 0 15 11 11 0 0 1 0-15" stroke="currentColor" strokeWidth="1.3" />
      </svg>
    );
  }

  if (kind === "diagnostics") {
    return (
      <svg aria-hidden="true" viewBox="0 0 20 20" className="h-5 w-5" fill="none">
        <path d="M3 13.5h3l2.5-7 3 10 2.5-6h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    );
  }
  if (kind === "screen") {
    return <svg aria-hidden="true" viewBox="0 0 20 20" className="h-5 w-5" fill="none"><rect x="2.5" y="3.5" width="15" height="10.5" rx="2" stroke="currentColor" strokeWidth="1.4"/><path d="M7 17h6m-3-3v3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>;
  }
  if (kind === "devices") {
    return <svg aria-hidden="true" viewBox="0 0 20 20" className="h-5 w-5" fill="none"><rect x="2.5" y="4" width="10" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.4"/><path d="M6 15h3m-1.5-3v3m8-7v5m-2.3-2.5h4.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>;
  }
  if (kind === "captions") {
    return <svg aria-hidden="true" viewBox="0 0 20 20" className="h-5 w-5" fill="none"><rect x="2.5" y="4" width="15" height="12" rx="2" stroke="currentColor" strokeWidth="1.4"/><path d="M8.5 8.2a2.2 2.2 0 1 0 0 3.6m5-3.6a2.2 2.2 0 1 0 0 3.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>;
  }
  if (kind === "pip") {
    return <svg aria-hidden="true" viewBox="0 0 20 20" className="h-5 w-5" fill="none"><rect x="2.5" y="3.5" width="15" height="13" rx="2" stroke="currentColor" strokeWidth="1.4"/><rect x="10" y="9.5" width="5" height="4" rx=".8" fill="currentColor"/></svg>;
  }
  if (kind === "camera" || kind === "camera-off") {
    return <svg aria-hidden="true" viewBox="0 0 20 20" className="h-5 w-5" fill="none"><rect x="2.5" y="5" width="10" height="10" rx="2" stroke="currentColor" strokeWidth="1.4"/><path d="m12.5 8 4-2v8l-4-2V8Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>{kind === "camera-off" && <path d="M3 3l14 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>}</svg>;
  }
  return <svg aria-hidden="true" viewBox="0 0 20 20" className="h-5 w-5" fill="none"><rect x="7" y="2.5" width="6" height="10" rx="3" stroke="currentColor" strokeWidth="1.4"/><path d="M4.5 9.5a5.5 5.5 0 0 0 11 0M10 15v2.5m-2.5 0h5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>{kind === "mic-off" && <path d="M3 3l14 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>}</svg>;
}

function getSpeechRecognition(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const speechWindow = window as typeof window & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return (
    speechWindow.SpeechRecognition ??
    speechWindow.webkitSpeechRecognition ??
    null
  );
}

function formatElapsed(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0
    ? `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`
    : `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}
