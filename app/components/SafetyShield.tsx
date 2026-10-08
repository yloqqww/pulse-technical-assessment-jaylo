"use client";

import { useState } from "react";
import {
  SAFETY_REPORT_REASONS,
  type SafetyReportReason,
} from "@/lib/safety";

export default function SafetyShield({
  submitting,
  error,
  onLeave,
  onBlock,
  onReport,
  onClose,
}: {
  submitting: boolean;
  error: string | null;
  onLeave: () => void;
  onBlock: () => void;
  onReport: (reason: SafetyReportReason) => void;
  onClose: () => void;
}) {
  const [reason, setReason] = useState<SafetyReportReason | null>(null);

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-black/60 p-4 backdrop-blur-[3px]">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="safety-title"
        className="glass-panel ui-enter w-full max-w-md rounded-3xl border border-white/10 p-5 shadow-[0_28px_90px_rgba(0,0,0,0.52)] sm:p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-red-300/80">Safety Shield</p>
            <h2 id="safety-title" className="mt-2 text-xl font-semibold tracking-[-0.03em] text-zinc-50">
              You are in control
            </h2>
            <p className="mt-1.5 text-xs leading-5 text-zinc-500">
              Leave immediately, or prevent this anonymous session from contacting you again.
            </p>
          </div>
          <button type="button" onClick={onClose} disabled={submitting} aria-label="Close safety options" className="focus-ring pressable grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-white/8 bg-white/[0.035] text-zinc-500 hover:text-zinc-200 disabled:opacity-40">
            <span aria-hidden="true" className="text-lg">×</span>
          </button>
        </div>

        <div className="mt-5 grid gap-2">
          <button type="button" onClick={onLeave} disabled={submitting} className="focus-ring pressable min-h-11 rounded-xl border border-white/10 bg-white/[0.035] px-4 text-sm font-medium text-zinc-200 hover:bg-white/[0.065] disabled:opacity-40">
            Leave now
          </button>
          <button type="button" onClick={onBlock} disabled={submitting} className="focus-ring pressable min-h-11 rounded-xl border border-amber-200/15 bg-amber-300/[0.07] px-4 text-sm font-medium text-amber-100 hover:bg-amber-300/[0.11] disabled:opacity-40">
            Block this session and leave
          </button>
        </div>

        <div className="my-5 h-px bg-white/8" />
        <p className="text-xs font-medium text-zinc-300">Report and block</p>
        <p className="mt-1 text-[10px] leading-4 text-zinc-600">No chat, audio, or video content is uploaded with a report.</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {(Object.entries(SAFETY_REPORT_REASONS) as Array<[SafetyReportReason, string]>).map(([value, label]) => (
            <button key={value} type="button" onClick={() => setReason(value)} disabled={submitting} aria-pressed={reason === value} className={`focus-ring pressable min-h-10 rounded-xl border px-3 text-left text-[11px] transition-[border-color,background-color,color] duration-200 ${reason === value ? "border-red-200/25 bg-red-300/10 text-red-100" : "border-white/8 bg-white/[0.025] text-zinc-400 hover:bg-white/[0.05]"} disabled:opacity-40`}>
              {label}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => reason && onReport(reason)} disabled={!reason || submitting} className="focus-ring pressable mt-3 min-h-11 w-full rounded-xl bg-red-500 px-4 text-sm font-semibold text-white hover:bg-red-400 disabled:cursor-not-allowed disabled:opacity-35">
          {submitting ? "Securing session…" : "Submit report and leave"}
        </button>
        {error && <p role="alert" className="mt-3 text-xs text-red-300">{error}</p>}
      </section>
    </div>
  );
}
