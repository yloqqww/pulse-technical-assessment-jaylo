// Client-side helpers for the anonymous coordination API.
import type { PollResponse, SignalType } from "@/lib/types";
import type { ConversationIntent } from "@/lib/intent";
import type { SessionCredentials } from "@/lib/api-security";

export type { SessionCredentials } from "@/lib/api-security";

export async function join(
  lat: number,
  lng: number,
  intent: ConversationIntent,
): Promise<SessionCredentials> {
  const response = await fetch("/api/join", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lat, lng, intent }),
  });

  const data = await readJsonResponse<unknown>(response, "join");
  if (!isSessionCredentials(data)) {
    throw new Error("join returned invalid session credentials");
  }
  return data;
}

export async function poll(
  session: SessionCredentials,
): Promise<PollResponse> {
  const response = await fetch("/api/poll", {
    cache: "no-store",
    headers: authHeaders(session),
  });

  return readJsonResponse<PollResponse>(response, "poll");
}

export async function sendSignal(
  session: SessionCredentials,
  toId: string,
  type: SignalType,
  payload?: string,
): Promise<void> {
  const response = await fetch("/api/signal", {
    method: "POST",
    headers: {
      ...authHeaders(session),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ toId, type, payload }),
  });

  await readJsonResponse(response, "signal");
}

// Best-effort authenticated leave that survives the tab closing. A queued
// beacon cannot expose its eventual response, so a failed queue falls back to
// keepalive fetch and reports transport/server failures to the console.
export function leave(session: SessionCredentials): void {
  const body = JSON.stringify(session);
  if (typeof navigator !== "undefined" && navigator.sendBeacon) {
    const queued = navigator.sendBeacon("/api/leave", body);
    if (queued) return;
  }

  void fetch("/api/leave", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  })
    .then(async (response) => {
      await readJsonResponse(response, "leave");
    })
    .catch((error: unknown) => {
      console.error("Leave request failed:", error);
    });
}

function authHeaders(session: SessionCredentials): Record<string, string> {
  return {
    Authorization: `Bearer ${session.token}`,
    "X-Pulse-Session-Id": session.id,
  };
}

async function readJsonResponse<T>(
  response: Response,
  operation: string,
): Promise<T> {
  const text = await response.text();
  let data: unknown = null;

  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`${operation} failed: invalid server response`);
    }
  }

  if (!response.ok) {
    const message =
      isErrorResponse(data) && data.error.length <= 160
        ? data.error
        : `HTTP ${response.status}`;
    throw new Error(`${operation} failed: ${message}`);
  }

  return data as T;
}

function isErrorResponse(value: unknown): value is { error: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof value.error === "string"
  );
}

function isSessionCredentials(value: unknown): value is SessionCredentials {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    "token" in value &&
    typeof value.id === "string" &&
    typeof value.token === "string"
  );
}
