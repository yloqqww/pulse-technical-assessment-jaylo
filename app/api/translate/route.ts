import type { NextRequest } from "next/server";
import { authenticateRequest } from "@/lib/session-auth";
import { noStoreJson } from "@/lib/api-security";
import {
  translateText,
  MAX_TRANSLATION_CHARS,
  type SupportedLanguage,
  SUPPORTED_TRANSLATION_LANGUAGES,
} from "@/lib/translation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const session = await authenticateRequest(request);
  if (!session) {
    return noStoreJson({ error: "unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return noStoreJson({ error: "invalid_body" }, { status: 400 });
  }

  const { text, targetLang, sourceLang } = body;
  if (typeof text !== "string" || text.trim().length === 0) {
    return noStoreJson({ error: "invalid_text" }, { status: 400 });
  }

  if (text.length > MAX_TRANSLATION_CHARS) {
    return noStoreJson({ error: "text_too_long" }, { status: 400 });
  }

  const validLangs = Object.keys(SUPPORTED_TRANSLATION_LANGUAGES);
  if (typeof targetLang !== "string" || !validLangs.includes(targetLang)) {
    return noStoreJson({ error: "invalid_target_language" }, { status: 400 });
  }

  const validSource =
    typeof sourceLang === "string" && validLangs.includes(sourceLang)
      ? (sourceLang as SupportedLanguage)
      : undefined;

  const result = await translateText(
    text,
    targetLang as SupportedLanguage,
    validSource,
  );

  return noStoreJson(result);
}
