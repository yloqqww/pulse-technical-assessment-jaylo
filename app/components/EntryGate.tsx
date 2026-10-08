"use client";

import { useState } from "react";
import {
  CONVERSATION_INTENTS,
  INTENT_DETAILS,
  type ConversationIntent,
} from "@/lib/intent";
import {
  LANGUAGE_DETAILS,
  SESSION_LANGUAGES,
  type SessionLanguage,
} from "@/lib/language";

export default function EntryGate({
  onReady,
}: {
  onReady: (
    lat: number,
    lng: number,
    intent: ConversationIntent,
    language: SessionLanguage,
  ) => Promise<void>;
}) {
  const [status, setStatus] = useState<"idle" | "locating" | "error">("idle");
  const [error, setError] = useState<string>("");
  const [intent, setIntent] = useState<ConversationIntent | null>(null);
  const [language, setLanguage] = useState<SessionLanguage>("en");

  function enter() {
    if (!intent) return;
    if (!("geolocation" in navigator)) {
      setStatus("error");
      setError("Your browser doesn't support location access.");
      return;
    }
    setStatus("locating");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        void onReady(pos.coords.latitude, pos.coords.longitude, intent, language).catch(() => {
          setStatus("error");
          setError("Couldn't start a secure session. Please try again.");
        });
      },
      (err) => {
        setStatus("error");
        setError(
          err.code === err.PERMISSION_DENIED
            ? "Location permission is required to place you on the map."
            : "Couldn't get your location. Please try again.",
        );
      },
      // High accuracy + maximumAge:0 forces a fresh fix (Wi-Fi/GPS scan)
      // instead of reusing the browser's cached IP-based location.
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  }

  return (
    <main className="entry-shell flex flex-1 items-center justify-center px-5 py-10 text-zinc-100 sm:px-8">
      <div className="entry-orbit" aria-hidden="true" />

      <section className="entry-card glass-panel w-full max-w-[480px] rounded-[24px] p-6 sm:p-8">
        <div className="flex items-center justify-between border-b border-white/8 pb-5">
          <div className="flex items-center gap-2.5">
            <span className="relative flex h-8 w-8 items-center justify-center rounded-full border border-emerald-200/15 bg-emerald-300/8">
              <span className="h-2 w-2 rounded-full bg-[#74e8bd] shadow-[0_0_14px_rgba(116,232,189,0.7)]" />
            </span>
            <span className="text-[15px] font-semibold tracking-[-0.02em]">Pulse</span>
          </div>
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">
            Live / Private
          </span>
        </div>

        <div className="pb-6 pt-8 text-center sm:pb-7 sm:pt-9">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-emerald-200/65">
            One world. One conversation.
          </p>
          <h1 className="mt-4 text-[2.5rem] font-semibold leading-[0.98] tracking-[-0.055em] text-white sm:text-[3rem]">
            Meet someone
            <br />
            <span className="text-zinc-500">new, right now.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-[320px] text-[14px] leading-6 text-zinc-400">
            Step onto the live map and start an anonymous, peer-to-peer
            conversation.
          </p>
        </div>

        <fieldset>
          <legend className="mb-3 flex w-full items-center justify-between text-left">
            <span className="text-xs font-medium text-zinc-200">What brings you here?</span>
            <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-zinc-600">
              One choice
            </span>
          </legend>
          <div className="grid grid-cols-2 gap-2.5">
            {CONVERSATION_INTENTS.map((value) => {
              const detail = INTENT_DETAILS[value];
              const selected = intent === value;

              return (
                <label
                  key={value}
                  className={`intent-option pressable ${
                    selected ? "intent-option-selected" : ""
                  }`}
                >
                  <input
                    type="radio"
                    name="conversation-intent"
                    value={value}
                    checked={selected}
                    onChange={() => setIntent(value)}
                    className="sr-only"
                  />
                  <span className="intent-option-mark" aria-hidden="true">
                    {detail.symbol}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[13px] font-semibold text-zinc-100">
                      {detail.label}
                    </span>
                    <span className="mt-0.5 block text-[10px] leading-4 text-zinc-500">
                      {detail.description}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <div className="mt-4 flex items-center justify-between gap-4 rounded-xl border border-white/8 bg-white/[0.025] px-3.5 py-3">
          <div className="min-w-0">
            <label htmlFor="session-language" className="block text-xs font-medium text-zinc-200">
              Conversation language
            </label>
            <p className="mt-0.5 text-[10px] leading-4 text-zinc-600">
              Used for Smart Match and live captions.
            </p>
          </div>
          <select
            id="session-language"
            value={language}
            onChange={(event) => setLanguage(event.target.value as SessionLanguage)}
            className="focus-ring min-h-10 shrink-0 rounded-lg border border-white/10 bg-[#111719] px-3 text-xs font-medium text-zinc-200 outline-none"
          >
            {SESSION_LANGUAGES.map((value) => (
              <option key={value} value={value}>
                {LANGUAGE_DETAILS[value].nativeLabel}
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={enter}
          disabled={status === "locating" || !intent}
          className="focus-ring pressable mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#74e8bd] px-6 text-sm font-semibold text-[#07110d] shadow-[0_10px_30px_rgba(64,211,158,0.14)] hover:bg-[#8df0c9] disabled:cursor-not-allowed disabled:opacity-45"
        >
          {status === "locating" && <span className="locating-spinner" aria-hidden="true" />}
          {status === "locating" ? "Finding your place…" : "Enter the live map"}
          {status !== "locating" && (
            <svg aria-hidden="true" viewBox="0 0 16 16" className="h-4 w-4" fill="none">
              <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </button>

        {status === "error" && (
          <div
            role="alert"
            className="ui-enter-fast mt-3 rounded-xl border border-red-400/15 bg-red-400/7 px-4 py-3 text-center text-xs leading-5 text-red-200"
          >
            {error}
          </div>
        )}

        <div className="mt-5 grid grid-cols-2 gap-3 border-t border-white/8 pt-5 text-[11px] leading-4 text-zinc-500">
          <p className="flex gap-2">
            <svg aria-hidden="true" viewBox="0 0 16 16" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-400" fill="none">
              <path d="M8 1.75 13 4v3.7c0 3.1-2.1 5.4-5 6.55-2.9-1.15-5-3.45-5-6.55V4l5-2.25Z" stroke="currentColor" strokeWidth="1.2" />
              <path d="m5.75 8 1.4 1.4 3.15-3.15" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            No account or history
          </p>
          <p className="flex gap-2">
            <svg aria-hidden="true" viewBox="0 0 16 16" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-400" fill="none">
              <path d="M8 14s4.5-3.65 4.5-7.5a4.5 4.5 0 1 0-9 0C3.5 10.35 8 14 8 14Z" stroke="currentColor" strokeWidth="1.2" />
              <circle cx="8" cy="6.5" r="1.5" stroke="currentColor" strokeWidth="1.2" />
            </svg>
            Location offset 1–3 km
          </p>
        </div>
      </section>
    </main>
  );
}
