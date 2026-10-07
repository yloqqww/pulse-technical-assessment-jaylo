"use client";

// Reusable centered prompt for "someone wants to connect" and
// "someone wants to start video".
export default function ConnectionPrompt({
  eyebrow = "Incoming request",
  title,
  subtitle,
  acceptLabel,
  declineLabel,
  onAccept,
  onDecline,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  acceptLabel: string;
  declineLabel: string;
  onAccept: () => void;
  onDecline: () => void;
}) {
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/65 p-5 backdrop-blur-[3px]">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="connection-prompt-title"
        className="glass-panel ui-enter w-full max-w-[360px] rounded-[22px] p-6 text-center text-zinc-100 sm:p-7"
      >
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full border border-emerald-200/15 bg-emerald-300/8 text-[#74e8bd] shadow-[0_0_32px_rgba(116,232,189,0.08)]">
          <svg aria-hidden="true" viewBox="0 0 20 20" className="h-5 w-5" fill="none">
            <circle cx="7" cy="7" r="3" stroke="currentColor" strokeWidth="1.4" />
            <path d="M2.5 16c.35-3 2.05-4.5 4.5-4.5 1.24 0 2.26.38 3.02 1.14M13.5 6v6m-3-3h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </div>
        <p className="mt-4 font-mono text-[9px] uppercase tracking-[0.18em] text-emerald-200/55">
          {eyebrow}
        </p>
        <h2 id="connection-prompt-title" className="mt-2 text-xl font-semibold tracking-[-0.03em]">
          {title}
        </h2>
        <p className="mx-auto mt-2 max-w-[270px] text-sm leading-5 text-zinc-400">
          {subtitle ?? "Accept to begin a private, peer-to-peer conversation."}
        </p>
        <div className="mt-6 flex gap-2.5">
          <button
            onClick={onDecline}
            className="focus-ring pressable min-h-11 flex-1 rounded-xl border border-white/10 bg-white/[0.035] px-4 text-sm font-medium text-zinc-300 hover:border-white/20 hover:bg-white/[0.055]"
          >
            {declineLabel}
          </button>
          <button
            onClick={onAccept}
            className="focus-ring pressable min-h-11 flex-1 rounded-xl bg-[#74e8bd] px-4 text-sm font-semibold text-[#07110d] hover:bg-[#8df0c9]"
          >
            {acceptLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
