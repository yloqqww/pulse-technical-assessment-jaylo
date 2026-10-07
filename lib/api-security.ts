import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";

export const SESSION_ID_HEADER = "x-pulse-session-id";
export const MAX_JOIN_BODY_BYTES = 1024;
export const MAX_SIGNAL_BODY_BYTES = 72 * 1024;
export const MAX_LEAVE_BODY_BYTES = 1024;
export const MAX_SDP_BYTES = 48 * 1024;
export const MAX_ICE_BYTES = 4 * 1024;

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/i;

export class InvalidRequestError extends Error {}

export interface SessionCredentials {
  id: string;
  token: string;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function hasOnlyKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
): boolean {
  const allowed = new Set(allowedKeys);
  return Object.keys(value).every((key) => allowed.has(key));
}

export function isSessionId(value: unknown): value is string {
  return typeof value === "string" && UUID_V4_PATTERN.test(value);
}

export function isSessionToken(value: unknown): value is string {
  return typeof value === "string" && TOKEN_PATTERN.test(value);
}

export function generateSessionCredentials(): SessionCredentials {
  return {
    id: randomUUID(),
    token: randomBytes(32).toString("base64url"),
  };
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function sessionTokenMatches(
  token: unknown,
  storedHash: string | null,
): boolean {
  if (!isSessionToken(token) || !storedHash || !SHA256_PATTERN.test(storedHash)) {
    return false;
  }

  const actual = createHash("sha256").update(token, "utf8").digest();
  const expected = Buffer.from(storedHash, "hex");

  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function utf8ByteLength(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

export function getBearerToken(request: Request): string | null {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return null;

  const token = authorization.slice("Bearer ".length);
  return isSessionToken(token) ? token : null;
}

export async function readLimitedJsonObject(
  request: Request,
  maxBytes: number,
  requireJsonContentType = true,
): Promise<Record<string, unknown>> {
  if (requireJsonContentType) {
    const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
    if (!contentType.startsWith("application/json")) {
      throw new InvalidRequestError("content type must be application/json");
    }
  }

  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null) {
    const parsedLength = Number(declaredLength);
    if (!Number.isFinite(parsedLength) || parsedLength < 0 || parsedLength > maxBytes) {
      throw new InvalidRequestError("request body too large");
    }
  }

  if (!request.body) {
    throw new InvalidRequestError("missing request body");
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        throw new InvalidRequestError("request body too large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new InvalidRequestError("invalid JSON body");
  }

  if (!isRecord(parsed)) {
    throw new InvalidRequestError("request body must be an object");
  }

  return parsed;
}

export function noStoreJson(
  data: unknown,
  init: { status?: number; headers?: HeadersInit } = {},
): Response {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-store, private");

  return Response.json(data, { status: init.status, headers });
}
