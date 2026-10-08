import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import { prisma } from "./prisma.ts";

export type AbuseAction =
  | "join"
  | "poll"
  | "signal"
  | "signal:request"
  | "safety"
  | "thanks";

interface RateLimitPolicy {
  windowMs: number;
  maxRequests: number;
  basePenaltyMs: number;
}

const POLICIES: Record<AbuseAction, RateLimitPolicy> = {
  join: {
    windowMs: 60_000,
    maxRequests: 15,
    basePenaltyMs: 120_000, // 2 minutes
  },
  poll: {
    windowMs: 60_000,
    maxRequests: 90,
    basePenaltyMs: 60_000, // 1 minute
  },
  signal: {
    windowMs: 60_000,
    maxRequests: 80,
    basePenaltyMs: 60_000,
  },
  "signal:request": {
    windowMs: 60_000,
    maxRequests: 12,
    basePenaltyMs: 180_000, // 3 minutes
  },
  safety: {
    windowMs: 300_000, // 5 minutes
    maxRequests: 8,
    basePenaltyMs: 300_000,
  },
  thanks: {
    windowMs: 300_000,
    maxRequests: 6,
    basePenaltyMs: 300_000,
  },
};

const ABUSE_SALT = process.env.ABUSE_PROTECTION_SALT ?? "pulse-distributed-abuse-salt-2026";

/**
 * Extracts the client IP from standard proxy headers and returns a cryptographic
 * one-way hash with a server secret.
 *
 * Strict Privacy Guarantee: Raw IP addresses are NEVER logged, saved, or exposed.
 */
export function hashClientIdentifier(request: NextRequest, action: AbuseAction): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");
  const rawIp = forwarded ? forwarded.split(",")[0].trim() : realIp ?? "127.0.0.1";

  // Double-hash raw IP with salt and action scope
  const hash = createHash("sha256")
    .update(`${rawIp}:${action}:${ABUSE_SALT}`)
    .digest("hex");

  return `client_${hash.slice(0, 32)}`;
}

export interface CheckAbuseResult {
  allowed: boolean;
  retryAfterSeconds?: number;
  remaining?: number;
  strikes?: number;
}

/**
 * Distributed rate limiter and abuse shield backed by Neon Postgres.
 * Safe for multi-instance serverless deployments (Vercel).
 */
export async function checkDistributedAbuse(
  request: NextRequest,
  action: AbuseAction,
): Promise<CheckAbuseResult> {
  const targetHash = hashClientIdentifier(request, action);
  const policy = POLICIES[action];
  const now = new Date();

  try {
    const existing = await prisma.abuseGuard.findUnique({
      where: { targetHash },
    });

    if (existing) {
      // Check if client is currently in an active quarantine penalty
      if (existing.blockedUntil && existing.blockedUntil.getTime() > now.getTime()) {
        const retryAfterSeconds = Math.ceil(
          (existing.blockedUntil.getTime() - now.getTime()) / 1000,
        );
        return {
          allowed: false,
          retryAfterSeconds,
          strikes: existing.strikes,
        };
      }

      // Check if current sliding window has expired
      const isWindowExpired =
        now.getTime() - existing.windowStart.getTime() > policy.windowMs;

      if (isWindowExpired) {
        // Reset window
        await prisma.abuseGuard.update({
          where: { targetHash },
          data: {
            count: 1,
            windowStart: now,
            blockedUntil: null,
          },
        });
        return {
          allowed: true,
          remaining: policy.maxRequests - 1,
          strikes: existing.strikes,
        };
      }

      // Within current window
      if (existing.count >= policy.maxRequests) {
        // Limit exceeded: apply progressive strike penalty
        const nextStrikes = existing.strikes + 1;
        const penaltyMultiplier = Math.min(nextStrikes, 5);
        const penaltyMs = policy.basePenaltyMs * penaltyMultiplier;
        const blockedUntil = new Date(now.getTime() + penaltyMs);

        await prisma.abuseGuard.update({
          where: { targetHash },
          data: {
            count: existing.count + 1,
            strikes: nextStrikes,
            blockedUntil,
          },
        });

        const retryAfterSeconds = Math.ceil(penaltyMs / 1000);
        return {
          allowed: false,
          retryAfterSeconds,
          strikes: nextStrikes,
        };
      }

      // Valid request within limits
      const updated = await prisma.abuseGuard.update({
        where: { targetHash },
        data: {
          count: { increment: 1 },
        },
      });

      return {
        allowed: true,
        remaining: Math.max(0, policy.maxRequests - updated.count),
        strikes: existing.strikes,
      };
    }

    // First time seeing this targetHash
    await prisma.abuseGuard.create({
      data: {
        targetHash,
        action,
        count: 1,
        windowStart: now,
        strikes: 0,
      },
    });

    return {
      allowed: true,
      remaining: policy.maxRequests - 1,
      strikes: 0,
    };
  } catch (error) {
    // Fail-open for database connection timeouts in distributed rate limiter
    // to preserve service availability for legitimate users
    console.error("Distributed rate limiter error:", error);
    return { allowed: true, remaining: 10 };
  }
}

/**
 * Routine cleanup of expired abuse records older than 24 hours.
 */
export async function cleanupExpiredAbuseRecords(): Promise<void> {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  try {
    await prisma.abuseGuard.deleteMany({
      where: {
        updatedAt: { lt: oneDayAgo },
        OR: [{ blockedUntil: null }, { blockedUntil: { lt: new Date() } }],
      },
    });
  } catch {
    // Best-effort cleanup
  }
}
