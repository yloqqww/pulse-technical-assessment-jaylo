import type { NextRequest } from "next/server";
import { noStoreJson } from "@/lib/api-security";
import { authenticateRequest } from "@/lib/session-auth";
import { resolveServerIceConfiguration } from "@/lib/ice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/ice-servers
 * Returns authenticated STUN and TURN configurations for the requesting session.
 * Protects TURN credentials from unauthenticated scrapers or public abuse.
 */
export async function GET(request: NextRequest) {
  const session = await authenticateRequest(request);
  if (!session) {
    return noStoreJson({ error: "unauthorized" }, { status: 401 });
  }

  const configuration = resolveServerIceConfiguration(session.id);
  return noStoreJson(configuration);
}
