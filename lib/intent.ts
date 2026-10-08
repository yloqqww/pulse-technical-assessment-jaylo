export const CONVERSATION_INTENTS = [
  "talk",
  "listen",
  "advice",
  "celebrate",
] as const;

export type ConversationIntent = (typeof CONVERSATION_INTENTS)[number];

export const INTENT_DETAILS: Record<
  ConversationIntent,
  { label: string; description: string; symbol: string }
> = {
  talk: {
    label: "Talk",
    description: "Share what is on your mind.",
    symbol: "T",
  },
  listen: {
    label: "Listen",
    description: "Be present for someone else.",
    symbol: "L",
  },
  advice: {
    label: "Advice",
    description: "Find another point of view.",
    symbol: "A",
  },
  celebrate: {
    label: "Celebrate",
    description: "Share a moment worth cheering.",
    symbol: "C",
  },
};

export function isConversationIntent(
  value: unknown,
): value is ConversationIntent {
  return (
    typeof value === "string" &&
    CONVERSATION_INTENTS.includes(value as ConversationIntent)
  );
}

export function pickIntentMatch<
  T extends { busy: boolean; intent: ConversationIntent; language: string },
>(
  peers: readonly T[],
  intent: ConversationIntent,
  language: string,
  random: () => number = Math.random,
): T | null {
  const matches = peers.filter(
    (peer) =>
      !peer.busy && peer.intent === intent && peer.language === language,
  );
  if (matches.length === 0) return null;

  const index = Math.min(
    matches.length - 1,
    Math.floor(random() * matches.length),
  );
  return matches[index];
}
