import type { NextRequest } from "next/server";

export const DEFAULT_DEV_MODERATOR_KEY = "pulse-moderator-secret-2026";

export function getModeratorKey(): string {
  return process.env.MODERATOR_KEY || process.env.ADMIN_KEY || DEFAULT_DEV_MODERATOR_KEY;
}

/**
 * Validates moderator credentials from headers or cookies.
 */
export function verifyModeratorRequest(request: NextRequest): boolean {
  const expectedKey = getModeratorKey();
  
  // Check x-moderator-key header
  const headerKey = request.headers.get("x-moderator-key");
  if (headerKey && headerKey === expectedKey) return true;

  // Check Bearer token in Authorization header
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    if (token === expectedKey) return true;
  }

  // Check cookie
  const cookieKey = request.cookies.get("pulse_moderator_key")?.value;
  if (cookieKey && cookieKey === expectedKey) return true;

  return false;
}
