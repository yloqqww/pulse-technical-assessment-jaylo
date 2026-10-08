export const SESSION_LANGUAGES = ["en", "fil", "es", "ja"] as const;

export type SessionLanguage = (typeof SESSION_LANGUAGES)[number];

export const LANGUAGE_DETAILS: Record<
  SessionLanguage,
  { label: string; nativeLabel: string; speechTag: string }
> = {
  en: { label: "English", nativeLabel: "English", speechTag: "en-US" },
  fil: { label: "Filipino", nativeLabel: "Filipino", speechTag: "fil-PH" },
  es: { label: "Spanish", nativeLabel: "Español", speechTag: "es-ES" },
  ja: { label: "Japanese", nativeLabel: "日本語", speechTag: "ja-JP" },
};

export function isSessionLanguage(value: unknown): value is SessionLanguage {
  return (
    typeof value === "string" &&
    SESSION_LANGUAGES.includes(value as SessionLanguage)
  );
}
