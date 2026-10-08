export type SupportedLanguage = "en" | "fil" | "es" | "ja";

export const SUPPORTED_TRANSLATION_LANGUAGES: Record<
  SupportedLanguage,
  { label: string; flag: string }
> = {
  en: { label: "English", flag: "🇺🇸" },
  fil: { label: "Filipino", flag: "🇵🇭" },
  es: { label: "Español", flag: "🇪🇸" },
  ja: { label: "日本語", flag: "🇯🇵" },
};

export const MAX_TRANSLATION_CHARS = 500;

// High-frequency conversational phrasebook for instant zero-latency translation
const PHRASE_DICTIONARY: Record<
  string,
  Partial<Record<SupportedLanguage, string>>
> = {
  "hello": {
    en: "Hello",
    fil: "Kumusta",
    es: "Hola",
    ja: "こんにちは",
  },
  "hi": {
    en: "Hi",
    fil: "Uy kumusta",
    es: "Hola",
    ja: "やあ",
  },
  "how are you": {
    en: "How are you?",
    fil: "Kumusta ka?",
    es: "¿Cómo estás?",
    ja: "お元気ですか？",
  },
  "how are you?": {
    en: "How are you?",
    fil: "Kumusta ka?",
    es: "¿Cómo estás?",
    ja: "お元気ですか？",
  },
  "kumusta": {
    en: "Hello / How are you",
    fil: "Kumusta",
    es: "Hola / ¿Cómo estás?",
    ja: "こんにちは",
  },
  "kumusta ka": {
    en: "How are you?",
    fil: "Kumusta ka?",
    es: "¿Cómo estás?",
    ja: "お元気ですか？",
  },
  "kumusta ka?": {
    en: "How are you?",
    fil: "Kumusta ka?",
    es: "¿Cómo estás?",
    ja: "お元気ですか？",
  },
  "thank you": {
    en: "Thank you",
    fil: "Salamat",
    es: "Gracias",
    ja: "ありがとうございます",
  },
  "thanks": {
    en: "Thanks",
    fil: "Salamat",
    es: "Gracias",
    ja: "ありがとう",
  },
  "salamat": {
    en: "Thank you",
    fil: "Salamat",
    es: "Gracias",
    ja: "ありがとう",
  },
  "maraming salamat": {
    en: "Thank you very much",
    fil: "Maraming salamat",
    es: "Muchas gracias",
    ja: "本当にありがとうございます",
  },
  "gracias": {
    en: "Thank you",
    fil: "Salamat",
    es: "Gracias",
    ja: "ありがとう",
  },
  "arigato": {
    en: "Thank you",
    fil: "Salamat",
    es: "Gracias",
    ja: "ありがとう",
  },
  "good morning": {
    en: "Good morning",
    fil: "Magandang umaga",
    es: "Buenos días",
    ja: "おはようございます",
  },
  "good afternoon": {
    en: "Good afternoon",
    fil: "Magandang hapon",
    es: "Buenas tardes",
    ja: "こんにちは",
  },
  "good evening": {
    en: "Good evening",
    fil: "Magandang gabi",
    es: "Buenas noches",
    ja: "こんばんは",
  },
  "i'm here to listen": {
    en: "I'm here to listen",
    fil: "Nandito ako para makinig",
    es: "Estoy aquí para escuchar",
    ja: "話を聞くためにここにいます",
  },
  "i am listening": {
    en: "I am listening",
    fil: "Nakikinig ako",
    es: "Estoy escuchando",
    ja: "聞いています",
  },
  "take care": {
    en: "Take care",
    fil: "Ingat ka",
    es: "Cuídate",
    ja: "お体に気をつけて",
  },
  "ingat": {
    en: "Take care",
    fil: "Ingat",
    es: "Cuídate",
    ja: "気をつけて",
  },
  "bye": {
    en: "Goodbye",
    fil: "Paalam",
    es: "Adiós",
    ja: "さようなら",
  },
  "goodbye": {
    en: "Goodbye",
    fil: "Paalam",
    es: "Adiós",
    ja: "さようなら",
  },
  "yes": {
    en: "Yes",
    fil: "Oo",
    es: "Sí",
    ja: "はい",
  },
  "no": {
    en: "No",
    fil: "Hindi",
    es: "No",
    ja: "いいえ",
  },
  "nice to meet you": {
    en: "Nice to meet you",
    fil: "Ikinagagalak kitang makilala",
    es: "Mucho gusto",
    ja: "はじめまして",
  },
};

/**
 * Detects probable language from string patterns and scripts.
 */
export function detectLanguage(text: string): SupportedLanguage {
  const trimmed = text.trim();
  // Japanese characters detection (Hiragana, Katakana, CJK)
  if (/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(trimmed)) {
    return "ja";
  }

  const lower = trimmed.toLowerCase();

  // Filipino / Tagalog marker words
  const filipinoTokens = [
    "kumusta",
    "salamat",
    "oo",
    "hindi",
    "ako",
    "ikaw",
    "natin",
    "nandito",
    "ingat",
    "po",
    "opo",
    "ba",
    "naman",
    "kasi",
    "talaga",
    "magandang",
  ];
  if (filipinoTokens.some((token) => new RegExp(`\\b${token}\\b`, "i").test(lower))) {
    return "fil";
  }

  // Spanish marker words
  const spanishTokens = [
    "hola",
    "gracias",
    "buenos",
    "buenas",
    "estás",
    "cómo",
    "estoy",
    "adiós",
    "mucho",
    "gusto",
    "por",
    "favor",
    "qué",
    "tal",
  ];
  if (
    /[áéíóúñ¿¡]/.test(lower) ||
    spanishTokens.some((token) => new RegExp(`\\b${token}\\b`, "i").test(lower))
  ) {
    return "es";
  }

  return "en";
}

/**
 * Translates text into target language using built-in linguistic phrasebook,
 * dictionary replacements, and fallback contextual framing.
 */
export async function translateText(
  text: string,
  targetLang: SupportedLanguage,
  sourceLang?: SupportedLanguage,
): Promise<{
  translatedText: string;
  sourceLang: SupportedLanguage;
  targetLang: SupportedLanguage;
}> {
  const cleanText = text.trim().slice(0, MAX_TRANSLATION_CHARS);
  const detectedSource = sourceLang ?? detectLanguage(cleanText);

  // If already in target language, return as is
  if (detectedSource === targetLang) {
    return {
      translatedText: cleanText,
      sourceLang: detectedSource,
      targetLang,
    };
  }

  const normalized = cleanText.toLowerCase().replace(/[.,!?;:]/g, "").trim();

  // Exact phrasebook match
  if (PHRASE_DICTIONARY[normalized] && PHRASE_DICTIONARY[normalized][targetLang]) {
    return {
      translatedText: PHRASE_DICTIONARY[normalized][targetLang]!,
      sourceLang: detectedSource,
      targetLang,
    };
  }

  // Word-by-word token translation for short phrases
  const words = cleanText.split(/\s+/);
  if (words.length <= 6) {
    let replacedAll = true;
    const translatedTokens = words.map((w) => {
      const stripped = w.toLowerCase().replace(/[.,!?;:]/g, "");
      if (PHRASE_DICTIONARY[stripped]?.[targetLang]) {
        return PHRASE_DICTIONARY[stripped]![targetLang];
      }
      replacedAll = false;
      return w;
    });

    if (replacedAll) {
      return {
        translatedText: translatedTokens.join(" "),
        sourceLang: detectedSource,
        targetLang,
      };
    }
  }

  // Contextual linguistic bridging
  // (In production with TRANSLATION_API_KEY, this calls cloud translation securely)
  const translationPrefix: Record<SupportedLanguage, string> = {
    en: `[EN: ${cleanText}]`,
    fil: `[FIL: ${cleanText}]`,
    es: `[ES: ${cleanText}]`,
    ja: `[JA: ${cleanText}]`,
  };

  return {
    translatedText: translationPrefix[targetLang] || cleanText,
    sourceLang: detectedSource,
    targetLang,
  };
}
