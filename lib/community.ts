export const COMMUNITY_REACTIONS = {
  heard: {
    label: "I felt heard",
    description: "They made space for what I shared.",
    symbol: "H",
  },
  helped: {
    label: "This helped",
    description: "I am leaving with something useful.",
    symbol: "+",
  },
  smile: {
    label: "Made me smile",
    description: "The conversation lifted my day.",
    symbol: "S",
  },
  listener: {
    label: "Good listener",
    description: "They were thoughtful and present.",
    symbol: "L",
  },
} as const;

export type CommunityReaction = keyof typeof COMMUNITY_REACTIONS;

export interface CommunityPulse {
  day: string;
  total: number;
  reactions: Record<CommunityReaction, number>;
}

export function isCommunityReaction(value: unknown): value is CommunityReaction {
  return typeof value === "string" && value in COMMUNITY_REACTIONS;
}

export function getUtcDay(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export function isCommunityPulse(value: unknown): value is CommunityPulse {
  if (typeof value !== "object" || value === null) return false;
  const pulse = value as Partial<CommunityPulse>;
  return (
    typeof pulse.day === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(pulse.day) &&
    isCount(pulse.total) &&
    typeof pulse.reactions === "object" &&
    pulse.reactions !== null &&
    isCount(pulse.reactions.heard) &&
    isCount(pulse.reactions.helped) &&
    isCount(pulse.reactions.smile) &&
    isCount(pulse.reactions.listener)
  );
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
