import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { applyPrivacyOffset, isValidLatLng } from "@/lib/geo";
import { isConversationIntent } from "@/lib/intent";
import {
  generateSessionCredentials,
  hasOnlyKeys,
  hashSessionToken,
  InvalidRequestError,
  MAX_JOIN_BODY_BYTES,
  noStoreJson,
  readLimitedJsonObject,
} from "@/lib/api-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/join — body { lat, lng } (raw coordinates).
// The server creates a public session id and a one-time private token. Only the
// token hash and privacy-offset coordinates are stored.
export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await readLimitedJsonObject(request, MAX_JOIN_BODY_BYTES);
  } catch (error) {
    const message =
      error instanceof InvalidRequestError ? error.message : "invalid body";
    return noStoreJson({ error: message }, { status: 400 });
  }

  if (!hasOnlyKeys(body, ["lat", "lng", "intent"])) {
    return noStoreJson({ error: "invalid body" }, { status: 400 });
  }

  const { lat, lng, intent } = body;
  if (!isValidLatLng(lat, lng)) {
    return noStoreJson({ error: "invalid coordinates" }, { status: 400 });
  }
  if (!isConversationIntent(intent)) {
    return noStoreJson({ error: "invalid intent" }, { status: 400 });
  }

  const credentials = generateSessionCredentials();
  const offset = applyPrivacyOffset(lat as number, lng as number);

  await prisma.presence.create({
    data: {
      id: credentials.id,
      tokenHash: hashSessionToken(credentials.token),
      lat: offset.lat,
      lng: offset.lng,
      intent,
      busy: false,
      lastSeen: new Date(),
    },
  });

  return noStoreJson(credentials, { status: 201 });
}
