"use client";

import { useState } from "react";

export default function EntryGate({
  onReady,
}: {
  onReady: (lat: number, lng: number) => Promise<void>;
}) {
  const [status, setStatus] = useState<"idle" | "locating" | "error">("idle");
  const [error, setError] = useState<string>("");

  function enter() {
    if (!("geolocation" in navigator)) {
      setStatus("error");
      setError("Your browser doesn't support location access.");
      return;
    }
    setStatus("locating");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        void onReady(pos.coords.latitude, pos.coords.longitude).catch(() => {
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

      <section className="entry-card glass-panel w-full max-w-[440px] rounded-[24px] p-6 sm:p-8">
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

        <div className="pb-7 pt-9 text-center sm:pb-8 sm:pt-11">
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

        <button
          onClick={enter}
          disabled={status === "locating"}
          className="focus-ring pressable flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#74e8bd] px-6 text-sm font-semibold text-[#07110d] shadow-[0_10px_30px_rgba(64,211,158,0.14)] hover:bg-[#8df0c9] disabled:cursor-wait disabled:opacity-70"
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
