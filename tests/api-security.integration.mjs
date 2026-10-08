import assert from "node:assert/strict";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

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

async function join(lat, lng, intent, language = "en") {
  const result = await request("/api/join", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lat, lng, intent, language }),
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

async function community(session, reaction, token = session.token) {
  return request("/api/community", {
    method: "POST",
    headers: {
      ...authHeaders({ id: session.id, token }),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ reaction }),
  });
}

async function safety(session, body, token = session.token) {
  return request("/api/safety", {
    method: "POST",
    headers: {
      ...authHeaders({ id: session.id, token }),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

let first;
let second;
let stale;
let leaving;
let contributedDay = null;

try {
  const invalidIntent = await request("/api/join", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lat: 14.5995, lng: 120.9842, intent: "dating", language: "en" }),
  });
  assert.equal(invalidIntent.response.status, 400);
  const invalidLanguage = await request("/api/join", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lat: 14.5995, lng: 120.9842, intent: "talk", language: "auto" }),
  });
  assert.equal(invalidLanguage.response.status, 400);

  first = await join(14.5995, 120.9842, "talk");
  second = await join(14.6095, 120.9942, "talk");

  const pulseBefore = await request("/api/community");
  assert.equal(pulseBefore.response.status, 200);
  assert.match(pulseBefore.response.headers.get("cache-control") ?? "", /no-store/i);

  const invalidThanks = await community(first, "rating");
  assert.equal(invalidThanks.response.status, 400);
  const wrongTokenThanks = await community(first, "heard", second.token);
  assert.equal(wrongTokenThanks.response.status, 401);
  const validThanks = await community(first, "heard");
  assert.equal(validThanks.response.status, 201);
  contributedDay = validThanks.body.day;
  assert.equal(validThanks.body.total, pulseBefore.body.total + 1);
  assert.equal(
    validThanks.body.reactions.heard,
    pulseBefore.body.reactions.heard + 1,
  );
  const duplicateThanks = await community(first, "helped");
  assert.equal(duplicateThanks.response.status, 409);

  const safetyA = await join(14.6395, 121.0242, "listen");
  const safetyB = await join(14.6495, 121.0342, "listen");
  const wrongTokenBlock = await safety(
    safetyA,
    { targetId: safetyB.id, action: "block" },
    safetyB.token,
  );
  assert.equal(wrongTokenBlock.response.status, 401);
  const invalidReport = await safety(safetyA, {
    targetId: safetyB.id,
    action: "report",
    reason: "free text",
  });
  assert.equal(invalidReport.response.status, 400);
  const blocked = await safety(safetyA, {
    targetId: safetyB.id,
    action: "block",
  });
  assert.equal(blocked.response.status, 200);
  const blockedSignal = await signal(safetyB, {
    toId: safetyA.id,
    type: "request",
  });
  assert.equal(blockedSignal.response.status, 403);
  assert.equal(blockedSignal.body.error, "interaction unavailable");
  const safetyAPoll = await poll(safetyA);
  const safetyBPoll = await poll(safetyB);
  assert.ok(!safetyAPoll.body.peers.some((peer) => peer.id === safetyB.id));
  assert.ok(!safetyBPoll.body.peers.some((peer) => peer.id === safetyA.id));

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
  assert.ok(
    firstPoll.body.peers.some(
      (peer) =>
        peer.id === second.id &&
        peer.intent === "talk" &&
        peer.language === "en",
    ),
  );

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

  stale = await join(14.6195, 121.0042, "advice");
  const initialHeartbeat = await poll(first);
  assert.equal(initialHeartbeat.response.status, 200);
  await new Promise((resolve) => setTimeout(resolve, 8_000));
  const heartbeat = await poll(first);
  assert.equal(heartbeat.response.status, 200);
  await new Promise((resolve) => setTimeout(resolve, 8_000));
  const cleanupPoll = await poll(first);
  assert.equal(cleanupPoll.response.status, 200);
  assert.ok(!cleanupPoll.body.peers.some((peer) => peer.id === stale.id));

  leaving = await join(14.6295, 121.0142, "celebrate");
  const beforeLeave = await poll(first);
  assert.ok(
    beforeLeave.body.peers.some(
      (peer) => peer.id === leaving.id && peer.intent === "celebrate",
    ),
  );
  const leaveResult = await leave(leaving);
  assert.equal(leaveResult.response.status, 200);
  const afterLeave = await poll(first);
  assert.ok(!afterLeave.body.peers.some((peer) => peer.id === leaving.id));

  const page = await fetch(baseUrl);
  assert.equal(page.headers.get("x-content-type-options"), "nosniff");
  assert.equal(page.headers.get("x-frame-options"), "DENY");
  assert.equal(page.headers.get("cross-origin-opener-policy"), "same-origin");

  console.log("Security integration checks passed:");
  console.log("- server-issued UUID and 32-byte anonymous token");
  console.log("- intent allowlist and authenticated peer intent metadata");
  console.log("- language allowlist and authenticated peer language metadata");
  console.log("- community reactions are allowlisted, authenticated, and one-per-session");
  console.log("- safety blocks are authenticated, mutual in discovery, and enforced in signaling");
  console.log("- wrong-token poll, signal, and leave rejected");
  console.log("- client-supplied fromId and self-signaling rejected");
  console.log("- authenticated signaling derives the sender identity");
  console.log("- request, accept, end, and reconnect signaling lifecycle");
  console.log("- stale presence expires from peer discovery");
  console.log("- session intent and language disappear when presence leaves");
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

  if (contributedDay && /^http:\/\/localhost(?::\d+)?$/.test(baseUrl)) {
    try {
      process.loadEnvFile();
      const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
      const cleanup = new PrismaClient({ adapter });
      await cleanup.communityPulseDaily.updateMany({
        where: { day: contributedDay, feltHeard: { gt: 0 } },
        data: { feltHeard: { decrement: 1 } },
      });
      await cleanup.$disconnect();
    } catch {
      // Best-effort aggregate cleanup must not hide the primary assertion failure.
    }
  }
}
