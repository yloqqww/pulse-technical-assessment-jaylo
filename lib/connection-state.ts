import { prisma } from "./prisma.ts";
import { STALE_MS } from "./presence.ts";

export type ConnectionStatus = "pending" | "connected" | "terminated";

export const PENDING_TIMEOUT_MS = 45_000; // 45s timeout for unanswered connection requests

export interface AuthorizeSignalResult {
  allowed: boolean;
  error?: string;
  autoDeclined?: boolean;
  connectionId?: string;
}

/**
 * Validates and updates the server-authorized connection state machine for WebRTC signaling.
 * Enforces that peers cannot send signals without an active or authorized connection relationship.
 */
export async function authorizeSignalTransition(params: {
  senderId: string;
  targetId: string;
  type: string;
}): Promise<AuthorizeSignalResult> {
  const { senderId, targetId, type } = params;
  const now = new Date();
  const stalePendingCutoff = new Date(now.getTime() - PENDING_TIMEOUT_MS);
  const stalePresenceCutoff = new Date(now.getTime() - STALE_MS);

  // Clean up any timed-out pending connections involving either peer
  await prisma.connectionPair.updateMany({
    where: {
      status: "pending",
      createdAt: { lt: stalePendingCutoff },
      OR: [
        { initiatorId: senderId },
        { receiverId: senderId },
        { initiatorId: targetId },
        { receiverId: targetId },
      ],
    },
    data: {
      status: "terminated",
      terminatedAt: now,
    },
  });

  if (type === "request") {
    // Terminate any previous pairs between these exact two peers so they can connect cleanly
    await prisma.connectionPair.updateMany({
      where: {
        status: { in: ["pending", "connected"] },
        OR: [
          { initiatorId: senderId, receiverId: targetId },
          { initiatorId: targetId, receiverId: senderId },
        ],
      },
      data: {
        status: "terminated",
        terminatedAt: now,
      },
    });

    // Check if target is in an active connection with someone else
    const targetActive = await prisma.connectionPair.findFirst({
      where: {
        status: { in: ["pending", "connected"] },
        OR: [
          { initiatorId: targetId, receiverId: { not: senderId } },
          { receiverId: targetId, initiatorId: { not: senderId } },
        ],
      },
    });

    if (targetActive) {
      const otherId =
        targetActive.initiatorId === targetId
          ? targetActive.receiverId
          : targetActive.initiatorId;
      const otherAlive = await prisma.presence.findFirst({
        where: { id: otherId, lastSeen: { gte: stalePresenceCutoff } },
        select: { id: true },
      });

      if (otherAlive) {
        return {
          allowed: false,
          autoDeclined: true,
          error: "target is currently busy",
        };
      }

      await prisma.connectionPair.update({
        where: { id: targetActive.id },
        data: { status: "terminated", terminatedAt: now },
      });
    }

    // Check if sender has an active connection with someone else
    const senderActive = await prisma.connectionPair.findFirst({
      where: {
        status: "connected",
        OR: [
          { initiatorId: senderId, receiverId: { not: targetId } },
          { receiverId: senderId, initiatorId: { not: targetId } },
        ],
      },
    });

    if (senderActive) {
      const otherId =
        senderActive.initiatorId === senderId
          ? senderActive.receiverId
          : senderActive.initiatorId;
      const otherAlive = await prisma.presence.findFirst({
        where: { id: otherId, lastSeen: { gte: stalePresenceCutoff } },
        select: { id: true },
      });

      if (otherAlive) {
        return {
          allowed: false,
          error: "you already have an active conversation",
        };
      }

      await prisma.connectionPair.update({
        where: { id: senderActive.id },
        data: { status: "terminated", terminatedAt: now },
      });
    }

    // Clean up any previous terminated rows between these exact two peers
    await prisma.connectionPair.deleteMany({
      where: {
        status: "terminated",
        OR: [
          { initiatorId: senderId, receiverId: targetId },
          { initiatorId: targetId, receiverId: senderId },
        ],
      },
    });

    // Create a new server-authorized pending connection pair
    const connection = await prisma.connectionPair.create({
      data: {
        initiatorId: senderId,
        receiverId: targetId,
        status: "pending",
      },
    });

    await prisma.presence.updateMany({
      where: { id: { in: [senderId, targetId] } },
      data: { busy: true },
    });

    return { allowed: true, connectionId: connection.id };
  }

  if (type === "accept") {
    // Only the designated receiver can accept a pending request from the initiator
    const pending = await prisma.connectionPair.findFirst({
      where: {
        initiatorId: targetId,
        receiverId: senderId,
        status: "pending",
      },
    });

    if (!pending) {
      return {
        allowed: false,
        error: "no pending connection request from this peer",
      };
    }

    // Transition connection state to connected
    await prisma.connectionPair.update({
      where: { id: pending.id },
      data: {
        status: "connected",
        connectedAt: now,
      },
    });

    await prisma.presence.updateMany({
      where: { id: { in: [senderId, targetId] } },
      data: { busy: true },
    });

    return { allowed: true, connectionId: pending.id };
  }

  if (type === "decline") {
    // Receiver declining an incoming request, or initiator canceling an outgoing request
    const pending = await prisma.connectionPair.findFirst({
      where: {
        status: "pending",
        OR: [
          { initiatorId: targetId, receiverId: senderId },
          { initiatorId: senderId, receiverId: targetId },
        ],
      },
    });

    if (pending) {
      await prisma.connectionPair.update({
        where: { id: pending.id },
        data: {
          status: "terminated",
          terminatedAt: now,
        },
      });
    }

    await prisma.presence.updateMany({
      where: { id: { in: [senderId, targetId] } },
      data: { busy: false },
    });

    return { allowed: true };
  }

  if (type === "offer" || type === "answer" || type === "ice") {
    // Signaling media messages require an authorized pair (connected, or pending for the offer/answer handshake)
    const connection = await prisma.connectionPair.findFirst({
      where: {
        status: { in: ["connected", "pending"] },
        OR: [
          { initiatorId: senderId, receiverId: targetId },
          { initiatorId: targetId, receiverId: senderId },
        ],
      },
    });

    if (!connection) {
      return {
        allowed: false,
        error: "unauthorized signaling: no active connection pair",
      };
    }

    return { allowed: true, connectionId: connection.id };
  }

  if (type === "end") {
    // Either participant can end an active or pending connection
    const connection = await prisma.connectionPair.findFirst({
      where: {
        status: { in: ["connected", "pending"] },
        OR: [
          { initiatorId: senderId, receiverId: targetId },
          { initiatorId: targetId, receiverId: senderId },
        ],
      },
    });

    if (connection) {
      await prisma.connectionPair.update({
        where: { id: connection.id },
        data: {
          status: "terminated",
          terminatedAt: now,
        },
      });
    }

    await prisma.presence.updateMany({
      where: { id: { in: [senderId, targetId] } },
      data: { busy: false },
    });

    return { allowed: true };
  }

  return { allowed: false, error: "unknown signal type" };
}

/**
 * Checks whether two sessions ever had an authorized connection relationship.
 * Used to verify legitimacy of safety reports or appreciation signals.
 */
export async function verifyConnectionRelationship(
  sessionA: string,
  sessionB: string,
): Promise<{ verified: boolean; status?: string }> {
  const connection = await prisma.connectionPair.findFirst({
    where: {
      OR: [
        { initiatorId: sessionA, receiverId: sessionB },
        { initiatorId: sessionB, receiverId: sessionA },
      ],
    },
    orderBy: { createdAt: "desc" },
  });

  if (!connection) {
    return { verified: false };
  }

  return {
    verified: true,
    status: connection.status,
  };
}
