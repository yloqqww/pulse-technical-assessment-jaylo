import { createHmac } from "node:crypto";
import type { SessionCredentials } from "./api-security.ts";

export interface IceServerConfig {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface IceServersResponse {
  iceServers: IceServerConfig[];
  turnConfigured: boolean;
  relayOnlyAvailable: boolean;
  expiresAt?: number;
}

export const DEFAULT_STUN_SERVERS: IceServerConfig[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun.cloudflare.com:3478" },
];

export function isValidIceServer(value: unknown): value is IceServerConfig {
  if (typeof value !== "object" || value === null) return false;
  const config = value as Partial<IceServerConfig>;
  if (!config.urls) return false;
  if (typeof config.urls === "string") {
    if (config.urls.trim().length === 0) return false;
  } else if (Array.isArray(config.urls)) {
    if (
      config.urls.length === 0 ||
      !config.urls.every((u) => typeof u === "string" && u.trim().length > 0)
    ) {
      return false;
    }
  } else {
    return false;
  }
  if (config.username !== undefined && typeof config.username !== "string") {
    return false;
  }
  if (config.credential !== undefined && typeof config.credential !== "string") {
    return false;
  }
  return true;
}

export function parseIceUrlList(raw: string | undefined): string[] {
  if (!raw) return [];
  const trimmed = raw.trim();
  if (!trimmed) return [];

  // Check if it's JSON array
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.filter((u): u is string => typeof u === "string" && u.trim().length > 0);
      }
    } catch {
      // fallback to comma separation
    }
  }

  return trimmed
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

/**
 * Resolves ICE servers based on environment variables.
 * If TURN_SECRET is set, generates time-limited RFC 5766 TURN credentials.
 * If static TURN credentials exist (TURN_USERNAME and TURN_CREDENTIAL), uses those.
 * Always includes resilient public STUN fallbacks.
 */
export function resolveServerIceConfiguration(sessionId?: string): IceServersResponse {
  const turnUrlsRaw = process.env.TURN_URLS ?? process.env.TURN_URL;
  const turnUrls = parseIceUrlList(turnUrlsRaw);

  const turnSecret = process.env.TURN_SECRET?.trim();
  const staticUsername = process.env.TURN_USERNAME?.trim();
  const staticCredential = (process.env.TURN_CREDENTIAL ?? process.env.TURN_PASSWORD)?.trim();

  const servers: IceServerConfig[] = [...DEFAULT_STUN_SERVERS];
  let turnConfigured = false;
  let expiresAt: number | undefined;

  if (turnUrls.length > 0) {
    if (turnSecret) {
      // RFC 5766 Coturn ephemeral credentials:
      // username = timestamp:sessionId
      // credential = base64(hmac-sha1(username, secret))
      const ttlSeconds = 86400; // 24 hours
      const expiry = Math.floor(Date.now() / 1000) + ttlSeconds;
      expiresAt = expiry * 1000;
      const effectiveSessionId = sessionId ?? "anonymous-pulse";
      const username = `${expiry}:${effectiveSessionId}`;
      const credential = createHmac("sha1", turnSecret).update(username).digest("base64");

      servers.push({
        urls: turnUrls,
        username,
        credential,
      });
      turnConfigured = true;
    } else if (staticUsername && staticCredential) {
      servers.push({
        urls: turnUrls,
        username: staticUsername,
        credential: staticCredential,
      });
      turnConfigured = true;
    } else {
      // URLs provided without credentials (might be public or test TURN)
      servers.push({
        urls: turnUrls,
      });
      turnConfigured = true;
    }
  }

  return {
    iceServers: servers,
    turnConfigured,
    relayOnlyAvailable: turnConfigured,
    expiresAt,
  };
}

/**
 * Client-side helper to fetch authenticated ICE servers from the server API.
 * Falls back to default STUN servers if offline or error occurs.
 */
export async function fetchIceServers(
  session: SessionCredentials | null,
): Promise<IceServersResponse> {
  if (!session) {
    return {
      iceServers: DEFAULT_STUN_SERVERS,
      turnConfigured: false,
      relayOnlyAvailable: false,
    };
  }

  try {
    const response = await fetch("/api/ice-servers", {
      headers: {
        "x-pulse-session-id": session.id,
        Authorization: `Bearer ${session.token}`,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch ice servers: ${response.status}`);
    }

    const data: unknown = await response.json();
    if (
      typeof data === "object" &&
      data !== null &&
      "iceServers" in data &&
      Array.isArray((data as { iceServers: unknown }).iceServers)
    ) {
      const parsed = data as IceServersResponse;
      return {
        iceServers: parsed.iceServers.filter(isValidIceServer),
        turnConfigured: Boolean(parsed.turnConfigured),
        relayOnlyAvailable: Boolean(parsed.relayOnlyAvailable),
        expiresAt: parsed.expiresAt,
      };
    }
  } catch (error) {
    console.warn("Using fallback STUN servers due to API error:", error);
  }

  return {
    iceServers: DEFAULT_STUN_SERVERS,
    turnConfigured: false,
    relayOnlyAvailable: false,
  };
}
