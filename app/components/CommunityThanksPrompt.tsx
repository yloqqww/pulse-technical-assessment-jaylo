"use client";

import {
  COMMUNITY_REACTIONS,
  type CommunityReaction,
} from "@/lib/community";

export default function CommunityThanksPrompt({
  submitting,
  error,
  onSubmit,
  onSkip,
}: {
  submitting: boolean;
  error: string | null;
  onSubmit: (reaction: CommunityReaction) => void;
  onSkip: () => void;
}) {
  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/45 p-4 backdrop-blur-[3px]">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="community-thanks-title"
        className="glass-panel ui-enter w-full max-w-md rounded-3xl border border-white/10 p-5 shadow-[0_28px_90px_rgba(0,0,0,0.48)] sm:p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-[#74e8bd]">
              Pulse Thanks
            </p>
            <h2
              id="community-thanks-title"
              className="mt-2 text-xl font-semibold tracking-[-0.03em] text-zinc-50"
            >
              How did that conversation feel?
            </h2>
            <p className="mt-1.5 text-xs leading-5 text-zinc-500">
              Share one anonymous signal of appreciation. No identity or message
              history is attached.
            </p>
          </div>
          <button
            type="button"
            onClick={onSkip}
            disabled={submitting}
            aria-label="Close feedback"
            className="focus-ring pressable grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-white/8 bg-white/[0.035] text-zinc-500 hover:bg-white/[0.07] hover:text-zinc-200 disabled:opacity-40"
          >
            <span aria-hidden="true" className="text-lg leading-none">×</span>
          </button>
        </div>

        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          {(Object.entries(COMMUNITY_REACTIONS) as Array<
            [CommunityReaction, (typeof COMMUNITY_REACTIONS)[CommunityReaction]]
          >).map(([value, detail]) => (
            <button
              key={value}
              type="button"
              disabled={submitting}
              onClick={() => onSubmit(value)}
              className="focus-ring pressable group flex min-h-[76px] items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.025] p-3 text-left transition-[border-color,background-color] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] hover:border-emerald-200/25 hover:bg-white/[0.055] disabled:cursor-wait disabled:opacity-45"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.04] font-mono text-[11px] text-[#74e8bd]">
                {detail.symbol}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium text-zinc-100">
                  {detail.label}
                </span>
                <span className="mt-0.5 block text-[10px] leading-4 text-zinc-600">
                  {detail.description}
                </span>
              </span>
            </button>
          ))}
        </div>

        {error && (
          <p role="alert" className="mt-3 text-xs text-red-300">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={onSkip}
          disabled={submitting}
          className="focus-ring pressable mt-4 min-h-10 w-full rounded-xl text-xs font-medium text-zinc-500 hover:text-zinc-300 disabled:opacity-40"
        >
          Maybe later
        </button>
      </section>
    </div>
  );
}
