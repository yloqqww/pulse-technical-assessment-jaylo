"use client";

import { useEffect, useRef } from "react";

export default function VideoPanel({
  localStream,
  remoteStream,
  onEnd,
}: {
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  onEnd: () => void;
}) {
  const localRef = useRef<HTMLVideoElement>(null);
  const remoteRef = useRef<HTMLVideoElement>(null);

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

  return (
    <section
      aria-label="Video call"
      className="video-stage absolute inset-0 z-50 flex flex-col bg-[#050708] text-zinc-100"
    >
      <header className="absolute inset-x-0 top-0 z-10 flex items-center justify-between bg-gradient-to-b from-black/70 to-transparent p-4 pt-[max(1rem,env(safe-area-inset-top))] sm:p-6">
        <div className="flex items-center gap-2.5">
          <span className="h-2 w-2 rounded-full bg-[#74e8bd] shadow-[0_0_12px_rgba(116,232,189,0.65)]" />
          <div>
            <p className="text-sm font-medium">Anonymous video</p>
            <p className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.16em] text-zinc-500">
              Peer-to-peer
            </p>
          </div>
        </div>
      </header>

      <div className="relative flex-1 overflow-hidden">
        {/* Remote (full screen) */}
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
        {/* Local (picture-in-picture) */}
        <video
          ref={localRef}
          autoPlay
          playsInline
          muted
          aria-label="Your camera preview"
          className="absolute bottom-24 right-3 h-36 w-24 rounded-2xl border border-white/15 bg-[#111719] object-cover shadow-[0_16px_50px_rgba(0,0,0,0.45)] sm:bottom-6 sm:right-6 sm:h-44 sm:w-32"
        />
      </div>
      <div className="absolute inset-x-0 bottom-0 z-10 flex justify-center bg-gradient-to-t from-black/80 to-transparent px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-10 sm:pb-6">
        <button
          onClick={onEnd}
          className="focus-ring pressable flex min-h-12 items-center gap-2 rounded-full border border-red-200/15 bg-red-500 px-6 text-sm font-semibold text-white shadow-[0_12px_35px_rgba(239,68,68,0.18)] hover:bg-red-400"
        >
          <svg aria-hidden="true" viewBox="0 0 18 18" className="h-4 w-4" fill="none">
            <path d="M3.5 7.5c3.5-2.3 7.5-2.3 11 0l-1.25 3-2.15-.9.2-1.35a7.9 7.9 0 0 0-4.6 0l.2 1.35-2.15.9-1.25-3Z" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          End video
        </button>
      </div>
    </section>
  );
}
