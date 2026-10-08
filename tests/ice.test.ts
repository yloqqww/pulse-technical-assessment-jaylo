import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_STUN_SERVERS,
  isValidIceServer,
  parseIceUrlList,
  resolveServerIceConfiguration,
} from "../lib/ice.ts";

test("provides resilient default STUN servers", () => {
  assert.equal(Array.isArray(DEFAULT_STUN_SERVERS), true);
  assert.equal(DEFAULT_STUN_SERVERS.length >= 2, true);
  for (const server of DEFAULT_STUN_SERVERS) {
    assert.equal(isValidIceServer(server), true);
  }
});

test("validates ice server configurations", () => {
  assert.equal(isValidIceServer({ urls: "stun:stun.example.com:3478" }), true);
  assert.equal(
    isValidIceServer({
      urls: ["turn:turn.example.com:3478?transport=udp"],
      username: "user",
      credential: "pass",
    }),
    true,
  );
  assert.equal(isValidIceServer({ urls: "" }), false);
  assert.equal(isValidIceServer({ urls: [] }), false);
  assert.equal(isValidIceServer({ urls: [""] }), false);
  assert.equal(isValidIceServer(null), false);
  assert.equal(isValidIceServer("stun:foo"), false);
  assert.equal(
    isValidIceServer({ urls: "stun:foo", username: 123 as unknown as string }),
    false,
  );
});

test("parses single, comma-separated, and json turn url lists", () => {
  assert.deepEqual(parseIceUrlList(""), []);
  assert.deepEqual(parseIceUrlList(undefined), []);
  assert.deepEqual(
    parseIceUrlList("turn:turn.pulse.test:3478?transport=udp"),
    ["turn:turn.pulse.test:3478?transport=udp"],
  );
  assert.deepEqual(
    parseIceUrlList(
      "turn:turn1.pulse.test:3478, turns:turn2.pulse.test:5349?transport=tcp",
    ),
    [
      "turn:turn1.pulse.test:3478",
      "turns:turn2.pulse.test:5349?transport=tcp",
    ],
  );
  assert.deepEqual(
    parseIceUrlList(
      JSON.stringify(["turn:turn1.pulse.test:3478", "turn:turn2.pulse.test:3478"]),
    ),
    [
      "turn:turn1.pulse.test:3478",
      "turn:turn2.pulse.test:3478",
    ],
  );
});

test("resolves default stun-only config when turn env vars are absent", () => {
  const originalUrls = process.env.TURN_URLS;
  const originalUrl = process.env.TURN_URL;
  const originalSecret = process.env.TURN_SECRET;
  delete process.env.TURN_URLS;
  delete process.env.TURN_URL;
  delete process.env.TURN_SECRET;

  try {
    const config = resolveServerIceConfiguration("test-session-id");
    assert.equal(config.turnConfigured, false);
    assert.equal(config.relayOnlyAvailable, false);
    assert.equal(config.iceServers.length, DEFAULT_STUN_SERVERS.length);
  } finally {
    process.env.TURN_URLS = originalUrls;
    process.env.TURN_URL = originalUrl;
    process.env.TURN_SECRET = originalSecret;
  }
});

test("generates ephemeral time-limited turn credentials with TURN_SECRET", () => {
  const originalUrls = process.env.TURN_URLS;
  const originalSecret = process.env.TURN_SECRET;
  process.env.TURN_URLS = "turn:turn.pulse.test:3478?transport=udp,turns:turn.pulse.test:5349";
  process.env.TURN_SECRET = "supersecretsharedturnkey123";

  try {
    const sessionId = "a1b2c3d4-0000-4000-8000-000000000001";
    const config = resolveServerIceConfiguration(sessionId);

    assert.equal(config.turnConfigured, true);
    assert.equal(config.relayOnlyAvailable, true);
    assert.equal(typeof config.expiresAt, "number");
    assert.equal(config.iceServers.length, DEFAULT_STUN_SERVERS.length + 1);

    const turnServer = config.iceServers[config.iceServers.length - 1];
    assert.equal(Array.isArray(turnServer.urls), true);
    assert.equal(typeof turnServer.username, "string");
    assert.equal(turnServer.username?.includes(sessionId), true);
    assert.equal(typeof turnServer.credential, "string");
    assert.equal((turnServer.credential?.length ?? 0) > 10, true);
  } finally {
    process.env.TURN_URLS = originalUrls;
    process.env.TURN_SECRET = originalSecret;
  }
});

test("supports static turn credentials with TURN_USERNAME and TURN_CREDENTIAL", () => {
  const originalUrls = process.env.TURN_URLS;
  const originalUser = process.env.TURN_USERNAME;
  const originalPass = process.env.TURN_CREDENTIAL;
  const originalSecret = process.env.TURN_SECRET;
  delete process.env.TURN_SECRET;

  process.env.TURN_URLS = "turn:static.pulse.test:3478";
  process.env.TURN_USERNAME = "pulse-agent";
  process.env.TURN_CREDENTIAL = "staticpassword456";

  try {
    const config = resolveServerIceConfiguration("test-session");
    assert.equal(config.turnConfigured, true);
    const turnServer = config.iceServers[config.iceServers.length - 1];
    assert.equal(turnServer.username, "pulse-agent");
    assert.equal(turnServer.credential, "staticpassword456");
  } finally {
    process.env.TURN_URLS = originalUrls;
    process.env.TURN_USERNAME = originalUser;
    process.env.TURN_CREDENTIAL = originalPass;
    process.env.TURN_SECRET = originalSecret;
  }
});
