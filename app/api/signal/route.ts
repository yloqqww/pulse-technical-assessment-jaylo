import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { STALE_MS } from "@/lib/presence";
import type { SignalType } from "@/lib/types";
import {
  hasOnlyKeys,
  InvalidRequestError,
  isRecord,
  isSessionId,
  MAX_ICE_BYTES,
  MAX_SDP_BYTES,
  MAX_SIGNAL_BODY_BYTES,
  noStoreJson,
  readLimitedJsonObject,
  utf8ByteLength,
} from "@/lib/api-security";
import { authenticateRequest } from "@/lib/session-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_TYPES = new Set<SignalType>([
  "request",
  "accept",
  "decline",
  "offer",
  "answer",
  "ice",
  "end",
]);
const PAYLOAD_TYPES = new Set<SignalType>(["offer", "answer", "ice"]);
const MAX_MAILBOX_SIGNALS = 256;

// POST /api/signal — authenticated sender; body { toId, type, payload? }.
export async function POST(request: NextRequest) {
  const sender = await authenticateRequest(request);
  if (!sender) {
    return noStoreJson({ error: "unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await readLimitedJsonObject(request, MAX_SIGNAL_BODY_BYTES);
  } catch (error) {
    const message =
      error instanceof InvalidRequestError ? error.message : "invalid body";
    return noStoreJson({ error: message }, { status: 400 });
  }

  if (!hasOnlyKeys(body, ["toId", "type", "payload"])) {
    return noStoreJson({ error: "invalid body" }, { status: 400 });
  }

  const { toId, type, payload } = body;
  if (!isSessionId(toId)) {
    return noStoreJson({ error: "invalid target" }, { status: 400 });
  }
  if (toId === sender.id) {
    return noStoreJson({ error: "self-signaling is not allowed" }, { status: 400 });
  }
  if (typeof type !== "string" || !VALID_TYPES.has(type as SignalType)) {
    return noStoreJson({ error: "invalid type" }, { status: 400 });
  }

  const signalType = type as SignalType;
  const payloadError = validatePayload(signalType, payload);
  if (payloadError) {
    return noStoreJson({ error: payloadError }, { status: 400 });
  }

  const staleCutoff = new Date(Date.now() - STALE_MS);
  if (sender.lastSeen < staleCutoff) {
    return noStoreJson({ error: "session expired" }, { status: 410 });
  }

  const target = await prisma.presence.findFirst({
    where: { id: toId, lastSeen: { gte: staleCutoff } },
    select: { busy: true },
  });
  if (!target) {
    return noStoreJson({ error: "target unavailable" }, { status: 404 });
  }

  if (signalType === "request" && target.busy) {
    const delivered = await createBoundedSignal({
      fromId: toId,
      toId: sender.id,
      type: "decline",
      payload: null,
    });
    if (!delivered) {
      return noStoreJson({ error: "mailbox full" }, { status: 429 });
    }
    return noStoreJson({ ok: true, autoDeclined: true });
  }

  // Preserve the current lightweight busy-state behavior. Relationship-level
  // authorization remains documented as future production work in NOTES.md.
  if (signalType === "accept") {
    await prisma.presence.updateMany({
      where: { id: { in: [sender.id, toId] } },
      data: { busy: true },
    });
  } else if (signalType === "decline" || signalType === "end") {
    await prisma.presence.updateMany({
      where: { id: { in: [sender.id, toId] } },
      data: { busy: false },
    });
  }

  const delivered = await createBoundedSignal({
    fromId: sender.id,
    toId,
    type: signalType,
    payload: typeof payload === "string" ? payload : null,
  });
  if (!delivered) {
    return noStoreJson({ error: "mailbox full" }, { status: 429 });
  }

  return noStoreJson({ ok: true });
}

function validatePayload(type: SignalType, payload: unknown): string | null {
  if (!PAYLOAD_TYPES.has(type)) {
    return payload === undefined || payload === null
      ? null
      : "payload is not allowed for this signal type";
  }

  if (typeof payload !== "string" || payload.length === 0) {
    return "payload is required for this signal type";
  }

  const maxBytes = type === "ice" ? MAX_ICE_BYTES : MAX_SDP_BYTES;
  if (utf8ByteLength(payload) > maxBytes) {
    return "payload too large";
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return "payload must contain valid JSON";
  }
  if (!isRecord(parsed)) return "invalid signaling payload";

  if (type === "offer" || type === "answer") {
    return parsed.type === type && typeof parsed.sdp === "string"
      ? null
      : "invalid session description";
  }

  return typeof parsed.candidate === "string"
    ? null
    : "invalid ICE candidate";
}

async function createBoundedSignal(data: {
  fromId: string;
  toId: string;
  type: SignalType;
  payload: string | null;
}): Promise<boolean> {
  const mailboxSize = await prisma.signal.count({ where: { toId: data.toId } });
  if (mailboxSize >= MAX_MAILBOX_SIGNALS) return false;

  await prisma.signal.create({ data });
  return true;
}
