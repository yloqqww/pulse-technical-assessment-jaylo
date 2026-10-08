import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { STALE_MS } from "@/lib/presence";
import { noStoreJson } from "@/lib/api-security";
import { verifyModeratorRequest } from "@/lib/moderator-auth";
import { getUtcDay } from "@/lib/community";
import { checkDistributedAbuse } from "@/lib/abuse-protection";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const abuse = await checkDistributedAbuse(request, "moderator");
    if (!abuse.allowed) {
      return noStoreJson(
        { error: "too_many_attempts", retryAfter: abuse.retryAfterSeconds },
        {
          status: 429,
          headers: { "Retry-After": String(abuse.retryAfterSeconds ?? 1800) },
        },
      );
    }

    if (!verifyModeratorRequest(request)) {
      return noStoreJson({ error: "unauthorized_moderator" }, { status: 401 });
    }


    const now = new Date();
    const staleCutoff = new Date(now.getTime() - STALE_MS);

    // Active sessions
    const activeSessions = await prisma.presence.findMany({
      where: { lastSeen: { gte: staleCutoff } },
      select: {
        id: true,
        intent: true,
        language: true,
        busy: true,
        lastSeen: true,
      },
      orderBy: { lastSeen: "desc" },
      take: 100,
    });

    // Active connection pairs
    const activeConnections = await prisma.connectionPair.findMany({
      where: { status: { in: ["pending", "connected"] } },
      select: {
        id: true,
        initiatorId: true,
        receiverId: true,
        status: true,
        createdAt: true,
        connectedAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    // Recent safety reports
    const reports = await prisma.safetyReport.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    // Verify connection relationship for each reported pair
    const enrichedReports = await Promise.all(
      reports.map(async (report) => {
        const connection = await prisma.connectionPair.findFirst({
          where: {
            OR: [
              { initiatorId: report.reporterSessionId, receiverId: report.reportedSessionId },
              { initiatorId: report.reportedSessionId, receiverId: report.reporterSessionId },
            ],
          },
        });
        return {
          id: report.id,
          reporterSessionId: report.reporterSessionId,
          reportedSessionId: report.reportedSessionId,
          reason: report.reason,
          status: report.status ?? "pending",
          actionTaken: report.actionTaken ?? null,
          reviewedAt: report.reviewedAt?.toISOString() ?? null,
          createdAt: report.createdAt.toISOString(),
          hadDirectConnection: !!connection,
        };
      }),
    );

    // Distributed abuse tracker records (quarantined or high strikes)
    const abuseRecords = await prisma.abuseGuard.findMany({
      where: {
        OR: [
          { blockedUntil: { gt: now } },
          { strikes: { gt: 0 } },
        ],
      },
      select: {
        id: true,
        targetHash: true, // Anonymous hash snippet (Zero raw IP exposure)
        action: true,
        count: true,
        strikes: true,
        blockedUntil: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: "desc" },
      take: 50,
    });

    // Today's community pulse
    const today = getUtcDay();
    const dailyPulse = await prisma.communityPulseDaily.findUnique({
      where: { day: today },
    });

    // Recent moderator audit log
    const auditLogs = await prisma.moderatorAction.findMany({
      orderBy: { createdAt: "desc" },
      take: 25,
    });

    return noStoreJson({
      stats: {
        totalActiveSessions: activeSessions.length,
        totalActiveConnections: activeConnections.length,
        totalPendingReports: reports.filter((r) => r.status === "pending").length,
        totalQuarantined: abuseRecords.filter((a) => a.blockedUntil && a.blockedUntil > now).length,
        communityReactions:
          (dailyPulse?.feltHeard ?? 0) +
          (dailyPulse?.helped ?? 0) +
          (dailyPulse?.madeSmile ?? 0) +
          (dailyPulse?.goodListener ?? 0),
      },
      activeSessions: activeSessions.map((s) => ({
        ...s,
        lastSeen: s.lastSeen.toISOString(),
      })),
      activeConnections: activeConnections.map((c) => ({
        ...c,
        createdAt: c.createdAt.toISOString(),
        connectedAt: c.connectedAt?.toISOString() ?? null,
      })),
      reports: enrichedReports,
      abuseRecords: abuseRecords.map((a) => ({
        ...a,
        blockedUntil: a.blockedUntil?.toISOString() ?? null,
        updatedAt: a.updatedAt.toISOString(),
      })),
      auditLogs: auditLogs.map((l) => ({
        ...l,
        createdAt: l.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error("Moderator API error:", error);
    return noStoreJson(
      {
        error: "moderator_error",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}


export async function POST(request: NextRequest) {
  if (!verifyModeratorRequest(request)) {
    return noStoreJson({ error: "unauthorized_moderator" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return noStoreJson({ error: "invalid_body" }, { status: 400 });
  }

  const { action, targetId, reason } = body;
  if (typeof action !== "string") {
    return noStoreJson({ error: "missing_action" }, { status: 400 });
  }

  const now = new Date();

  if (action === "terminate_session") {
    if (typeof targetId !== "string") {
      return noStoreJson({ error: "missing_target_id" }, { status: 400 });
    }
    // Delete session and free connected partner
    await prisma.presence.deleteMany({ where: { id: targetId } });
    await prisma.signal.deleteMany({
      where: { OR: [{ toId: targetId }, { fromId: targetId }] },
    });
    await prisma.connectionPair.updateMany({
      where: {
        status: { in: ["pending", "connected"] },
        OR: [{ initiatorId: targetId }, { receiverId: targetId }],
      },
      data: { status: "terminated", terminatedAt: now },
    });

    await prisma.moderatorAction.create({
      data: {
        action: "terminate_session",
        targetId,
        reason: typeof reason === "string" ? reason : "Moderator terminated session",
      },
    });

    return noStoreJson({ ok: true, message: "Session terminated successfully" });
  }

  if (action === "dismiss_report") {
    if (typeof targetId !== "string") {
      return noStoreJson({ error: "missing_report_id" }, { status: 400 });
    }
    await prisma.safetyReport.update({
      where: { id: targetId },
      data: {
        status: "dismissed",
        reviewedAt: now,
      },
    });

    await prisma.moderatorAction.create({
      data: {
        action: "dismiss_report",
        targetId,
        reason: typeof reason === "string" ? reason : "Report dismissed",
      },
    });

    return noStoreJson({ ok: true, message: "Report dismissed" });
  }

  if (action === "action_report") {
    if (typeof targetId !== "string") {
      return noStoreJson({ error: "missing_report_id" }, { status: 400 });
    }
    const report = await prisma.safetyReport.findUnique({
      where: { id: targetId },
    });
    if (!report) {
      return noStoreJson({ error: "report_not_found" }, { status: 404 });
    }

    // Terminate reported session
    await prisma.presence.deleteMany({ where: { id: report.reportedSessionId } });
    await prisma.safetyReport.update({
      where: { id: targetId },
      data: {
        status: "actioned",
        actionTaken: "session_terminated",
        reviewedAt: now,
      },
    });

    await prisma.moderatorAction.create({
      data: {
        action: "action_report",
        targetId: report.reportedSessionId,
        reason: typeof reason === "string" ? reason : `Actioned report for ${report.reason}`,
      },
    });

    return noStoreJson({ ok: true, message: "Report actioned and reported session terminated" });
  }

  if (action === "clear_abuse") {
    if (typeof targetId !== "string") {
      return noStoreJson({ error: "missing_target_hash" }, { status: 400 });
    }
    await prisma.abuseGuard.updateMany({
      where: { targetHash: targetId },
      data: {
        blockedUntil: null,
        strikes: 0,
      },
    });

    await prisma.moderatorAction.create({
      data: {
        action: "clear_abuse",
        targetId,
        reason: typeof reason === "string" ? reason : "Abuse quarantine cleared",
      },
    });

    return noStoreJson({ ok: true, message: "Client abuse penalty cleared" });
  }

  return noStoreJson({ error: "unsupported_action" }, { status: 400 });
}
