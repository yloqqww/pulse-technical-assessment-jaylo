import { prisma } from "./prisma.ts";

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
    // Check if target is already in an active connection
    const targetActive = await prisma.connectionPair.findFirst({
      where: {
        status: { in: ["pending", "connected"] },
        OR: [
          { initiatorId: targetId },
          { receiverId: targetId },
        ],
      },
    });

    if (targetActive) {
      // If target is already connected or pending with someone else, decline request
      return {
        allowed: false,
        autoDeclined: true,
        error: "target is currently busy",
      };
    }

    // Check if sender already has an active connection with someone else
    const senderActive = await prisma.connectionPair.findFirst({
      where: {
        status: "connected",
        OR: [
          { initiatorId: senderId },
          { receiverId: senderId },
        ],
      },
    });

    if (senderActive) {
      return {
        allowed: false,
        error: "you already have an active conversation",
      };
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
