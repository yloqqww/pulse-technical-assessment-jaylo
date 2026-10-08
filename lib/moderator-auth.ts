import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

export const DEFAULT_DEV_MODERATOR_KEY = "pulse-moderator-secret-2026";

export function getModeratorKey(): string {
  return process.env.MODERATOR_KEY || process.env.ADMIN_KEY || DEFAULT_DEV_MODERATOR_KEY;
}

function safeCompare(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a, "utf8");
    const bufB = Buffer.from(b, "utf8");
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

/**
 * Validates moderator credentials from headers or cookies using timing-safe comparison.
 */
export function verifyModeratorRequest(request: NextRequest): boolean {
  const expectedKey = getModeratorKey();

  const headerKey = request.headers.get("x-moderator-key");
  if (headerKey && safeCompare(headerKey, expectedKey)) return true;

  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    if (safeCompare(token, expectedKey)) return true;
  }

  const cookieKey = request.cookies.get("pulse_moderator_key")?.value;
  if (cookieKey && safeCompare(cookieKey, expectedKey)) return true;

  return false;
}

