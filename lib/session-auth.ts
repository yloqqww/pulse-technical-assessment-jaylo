import "server-only";

import { prisma } from "@/lib/prisma";
import {
  getBearerToken,
  isSessionId,
  isSessionToken,
  SESSION_ID_HEADER,
  sessionTokenMatches,
} from "@/lib/api-security";

export interface AuthenticatedSession {
  id: string;
  busy: boolean;
  lastSeen: Date;
}

export async function authenticateRequest(
  request: Request,
): Promise<AuthenticatedSession | null> {
  const id = request.headers.get(SESSION_ID_HEADER);
  const token = getBearerToken(request);
  if (!isSessionId(id) || !token) return null;

  return authenticateSession(id, token);
}

export async function authenticateSession(
  id: unknown,
  token: unknown,
): Promise<AuthenticatedSession | null> {
  if (!isSessionId(id) || !isSessionToken(token)) return null;

  const presence = await prisma.presence.findUnique({
    where: { id },
    select: { id: true, tokenHash: true, busy: true, lastSeen: true },
  });

  if (!presence || !sessionTokenMatches(token, presence.tokenHash)) return null;

  return {
    id: presence.id,
    busy: presence.busy,
    lastSeen: presence.lastSeen,
  };
}
