import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  hasOnlyKeys,
  InvalidRequestError,
  MAX_LEAVE_BODY_BYTES,
  noStoreJson,
  readLimitedJsonObject,
} from "@/lib/api-security";
import { authenticateSession } from "@/lib/session-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/leave — body { id, token }. sendBeacon cannot reliably attach an
// Authorization header, so the private token is accepted only in this bounded,
// same-origin request body.
export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await readLimitedJsonObject(request, MAX_LEAVE_BODY_BYTES, false);
  } catch (error) {
    const message =
      error instanceof InvalidRequestError ? error.message : "invalid body";
    return noStoreJson({ error: message }, { status: 400 });
  }

  if (!hasOnlyKeys(body, ["id", "token"])) {
    return noStoreJson({ error: "invalid body" }, { status: 400 });
  }

  const session = await authenticateSession(body.id, body.token);
  if (!session) {
    return noStoreJson({ error: "unauthorized" }, { status: 401 });
  }

  await prisma.signal.deleteMany({
    where: { OR: [{ toId: session.id }, { fromId: session.id }] },
  });
  await prisma.presence.delete({ where: { id: session.id } });

  return noStoreJson({ ok: true });
}
