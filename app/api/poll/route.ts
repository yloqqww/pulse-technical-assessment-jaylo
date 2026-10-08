import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { STALE_MS, SIGNAL_TTL_MS } from "@/lib/presence";
import type { ConversationIntent } from "@/lib/intent";
import type { SessionLanguage } from "@/lib/language";
import type { PollResponse } from "@/lib/types";
import { noStoreJson } from "@/lib/api-security";
import { authenticateRequest } from "@/lib/session-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_PEERS_PER_POLL = 5_000;
const MAX_SIGNALS_PER_POLL = 128;

// GET /api/poll — authenticated heartbeat, map snapshot, and mailbox drain.
export async function GET(request: NextRequest) {
  const session = await authenticateRequest(request);
  if (!session) {
    return noStoreJson({ error: "unauthorized" }, { status: 401 });
  }

  const now = Date.now();
  const staleCutoff = new Date(now - STALE_MS);
  const signalCutoff = new Date(now - SIGNAL_TTL_MS);

  await prisma.presence.update({
    where: { id: session.id },
    data: { lastSeen: new Date(now) },
  });

  await prisma.presence.deleteMany({ where: { lastSeen: { lt: staleCutoff } } });
  await prisma.signal.deleteMany({ where: { createdAt: { lt: signalCutoff } } });

  const blocks = await prisma.sessionBlock.findMany({
    where: { OR: [{ blockerId: session.id }, { blockedId: session.id }] },
    select: { blockerId: true, blockedId: true },
  });
  const blockedIds = blocks.map((block) =>
    block.blockerId === session.id ? block.blockedId : block.blockerId,
  );

  const peers = await prisma.presence.findMany({
    where: {
      id: { notIn: [session.id, ...blockedIds] },
      lastSeen: { gte: staleCutoff },
    },
    select: { id: true, lat: true, lng: true, intent: true, language: true, busy: true },
    take: MAX_PEERS_PER_POLL,
  });

  const inbox = await prisma.signal.findMany({
    where: { toId: session.id },
    orderBy: { createdAt: "asc" },
    take: MAX_SIGNALS_PER_POLL,
  });
  if (inbox.length > 0) {
    await prisma.signal.deleteMany({
      where: { id: { in: inbox.map((signal) => signal.id) } },
    });
  }

  const response: PollResponse = {
    peers: peers.map((peer) => ({
      id: peer.id,
      lat: peer.lat,
      lng: peer.lng,
      intent: peer.intent as ConversationIntent,
      language: peer.language as SessionLanguage,
      busy: peer.busy,
    })),
    signals: inbox.map((signal) => ({
      id: signal.id,
      fromId: signal.fromId,
      toId: signal.toId,
      type: signal.type as PollResponse["signals"][number]["type"],
      payload: signal.payload,
      createdAt: signal.createdAt.toISOString(),
    })),
  };

  return noStoreJson(response);
}
