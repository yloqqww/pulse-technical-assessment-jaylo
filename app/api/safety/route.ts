import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { STALE_MS } from "@/lib/presence";
import {
  hasOnlyKeys,
  InvalidRequestError,
  isSessionId,
  MAX_SAFETY_BODY_BYTES,
  noStoreJson,
  readLimitedJsonObject,
} from "@/lib/api-security";
import { authenticateRequest } from "@/lib/session-auth";
import { isSafetyAction, isSafetyReportReason } from "@/lib/safety";
import { checkDistributedAbuse } from "@/lib/abuse-protection";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REPORT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export async function POST(request: NextRequest) {
  const session = await authenticateRequest(request);
  if (!session) return noStoreJson({ error: "unauthorized" }, { status: 401 });

  const abuse = await checkDistributedAbuse(request, "safety");
  if (!abuse.allowed) {
    return noStoreJson(
      { error: "rate limit exceeded", retryAfter: abuse.retryAfterSeconds },
      {
        status: 429,
        headers: { "Retry-After": String(abuse.retryAfterSeconds ?? 60) },
      },
    );
  }


  let body: Record<string, unknown>;
  try {
    body = await readLimitedJsonObject(request, MAX_SAFETY_BODY_BYTES);
  } catch (error) {
    const message = error instanceof InvalidRequestError ? error.message : "invalid body";
    return noStoreJson({ error: message }, { status: 400 });
  }

  if (!hasOnlyKeys(body, ["targetId", "action", "reason"])) {
    return noStoreJson({ error: "invalid body" }, { status: 400 });
  }
  const { targetId, action, reason } = body;
  if (!isSessionId(targetId) || targetId === session.id) {
    return noStoreJson({ error: "invalid target" }, { status: 400 });
  }
  if (!isSafetyAction(action)) {
    return noStoreJson({ error: "invalid action" }, { status: 400 });
  }
  let reportReason: ReturnType<typeof getReportReason> = null;
  if (action === "report") {
    reportReason = getReportReason(reason);
    if (!reportReason) {
      return noStoreJson({ error: "invalid reason" }, { status: 400 });
    }
  } else if (reason !== undefined) {
    return noStoreJson({ error: "invalid reason" }, { status: 400 });
  }

  const now = new Date();
  const target = await prisma.presence.findFirst({
    where: {
      id: targetId,
      lastSeen: { gte: new Date(now.getTime() - STALE_MS) },
    },
    select: { id: true },
  });
  if (!target) return noStoreJson({ error: "target unavailable" }, { status: 404 });

  await prisma.$transaction(async (tx) => {
    await tx.sessionBlock.upsert({
      where: { blockerId_blockedId: { blockerId: session.id, blockedId: targetId } },
      create: { blockerId: session.id, blockedId: targetId },
      update: {},
    });
    await tx.signal.deleteMany({
      where: {
        OR: [
          { fromId: session.id, toId: targetId },
          { fromId: targetId, toId: session.id },
        ],
      },
    });
    await tx.presence.updateMany({
      where: { id: { in: [session.id, targetId] } },
      data: { busy: false },
    });
    await tx.connectionPair.updateMany({
      where: {
        status: { in: ["pending", "connected"] },
        OR: [
          { initiatorId: session.id, receiverId: targetId },
          { initiatorId: targetId, receiverId: session.id },
        ],
      },
      data: {
        status: "terminated",
        terminatedAt: now,
      },
    });

    if (action === "report" && reportReason) {
      await tx.safetyReport.upsert({
        where: {
          reporterSessionId_reportedSessionId: {
            reporterSessionId: session.id,
            reportedSessionId: targetId,
          },
        },
        create: {
          reporterSessionId: session.id,
          reportedSessionId: targetId,
          reason: reportReason,
          expiresAt: new Date(now.getTime() + REPORT_RETENTION_MS),
        },
        update: {
          reason: reportReason,
          createdAt: now,
          expiresAt: new Date(now.getTime() + REPORT_RETENTION_MS),
        },
      });
      await tx.safetyReport.deleteMany({ where: { expiresAt: { lt: now } } });
    }
  });

  return noStoreJson({ ok: true });
}

function getReportReason(value: unknown) {
  return isSafetyReportReason(value) ? value : null;
}
