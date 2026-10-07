import assert from "node:assert/strict";

const baseUrl = process.env.PULSE_TEST_BASE_URL ?? "http://localhost:3000";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const sessions = [];

async function request(path, init) {
  const response = await fetch(`${baseUrl}${path}`, init);
  const text = await response.text();
  let body = null;

  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      throw new Error(`${path} returned non-JSON (${response.status})`);
    }
  }

  return { response, body };
}

async function join(lat, lng) {
  const result = await request("/api/join", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lat, lng }),
  });

  assert.equal(result.response.status, 201);
  assert.match(result.body.id, uuidPattern);
  assert.equal(Buffer.from(result.body.token, "base64url").byteLength, 32);
  sessions.push(result.body);
  return result.body;
}

function authHeaders(session) {
  return {
    Authorization: `Bearer ${session.token}`,
    "X-Pulse-Session-Id": session.id,
  };
}

async function poll(session, token = session.token) {
  return request("/api/poll", {
    headers: authHeaders({ id: session.id, token }),
    cache: "no-store",
  });
}

async function signal(session, body, token = session.token) {
  return request("/api/signal", {
    method: "POST",
    headers: {
      ...authHeaders({ id: session.id, token }),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

async function leave(session, token = session.token) {
  return request("/api/leave", {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=UTF-8" },
    body: JSON.stringify({ id: session.id, token }),
  });
}

let first;
let second;
let stale;

try {
  first = await join(14.5995, 120.9842);
  second = await join(14.6095, 120.9942);

  const wrongPoll = await poll(first, second.token);
  assert.equal(wrongPoll.response.status, 401);

  const wrongSignal = await signal(
    first,
    { toId: second.id, type: "request" },
    second.token,
  );
  assert.equal(wrongSignal.response.status, 401);

  const spoofedSignal = await signal(first, {
    fromId: second.id,
    toId: second.id,
    type: "request",
  });
  assert.equal(spoofedSignal.response.status, 400);

  const selfSignal = await signal(first, {
    toId: first.id,
    type: "request",
  });
  assert.equal(selfSignal.response.status, 400);

  const wrongLeave = await leave(first, second.token);
  assert.equal(wrongLeave.response.status, 401);

  const firstPoll = await poll(first);
  assert.equal(firstPoll.response.status, 200);
  assert.match(firstPoll.response.headers.get("cache-control") ?? "", /no-store/i);
  assert.ok(firstPoll.body.peers.some((peer) => peer.id === second.id));

  const validSignal = await signal(first, {
    toId: second.id,
    type: "request",
  });
  assert.equal(validSignal.response.status, 200);

  const secondPoll = await poll(second);
  assert.equal(secondPoll.response.status, 200);
  assert.ok(
    secondPoll.body.signals.some(
      (item) =>
        item.fromId === first.id &&
        item.toId === second.id &&
        item.type === "request",
    ),
  );
  assert.ok(!JSON.stringify(secondPoll.body).includes(first.token));
  assert.ok(!JSON.stringify(secondPoll.body).includes(second.token));

  const accept = await signal(second, {
    toId: first.id,
    type: "accept",
  });
  assert.equal(accept.response.status, 200);
  const acceptedPoll = await poll(first);
  assert.ok(
    acceptedPoll.body.signals.some(
      (item) => item.fromId === second.id && item.type === "accept",
    ),
  );

  const end = await signal(first, { toId: second.id, type: "end" });
  assert.equal(end.response.status, 200);
  const endedPoll = await poll(second);
  assert.ok(
    endedPoll.body.signals.some(
      (item) => item.fromId === first.id && item.type === "end",
    ),
  );

  const reconnect = await signal(first, {
    toId: second.id,
    type: "request",
  });
  assert.equal(reconnect.response.status, 200);
  const reconnectPoll = await poll(second);
  assert.ok(
    reconnectPoll.body.signals.some(
      (item) => item.fromId === first.id && item.type === "request",
    ),
  );

  stale = await join(14.6195, 121.0042);
  await new Promise((resolve) => setTimeout(resolve, 16_000));
  const cleanupPoll = await poll(first);
  assert.equal(cleanupPoll.response.status, 200);
  assert.ok(!cleanupPoll.body.peers.some((peer) => peer.id === stale.id));

  const page = await fetch(baseUrl);
  assert.equal(page.headers.get("x-content-type-options"), "nosniff");
  assert.equal(page.headers.get("x-frame-options"), "DENY");
  assert.equal(page.headers.get("cross-origin-opener-policy"), "same-origin");

  console.log("Security integration checks passed:");
  console.log("- server-issued UUID and 32-byte anonymous token");
  console.log("- wrong-token poll, signal, and leave rejected");
  console.log("- client-supplied fromId and self-signaling rejected");
  console.log("- authenticated signaling derives the sender identity");
  console.log("- request, accept, end, and reconnect signaling lifecycle");
  console.log("- stale presence expires from peer discovery");
  console.log("- poll is no-store and does not expose session tokens");
  console.log("- conservative response headers are present");
} finally {
  for (const session of sessions) {
    try {
      await leave(session);
    } catch {
      // Best-effort cleanup must not hide the primary assertion failure.
    }
  }
}
