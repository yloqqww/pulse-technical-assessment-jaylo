import assert from "node:assert/strict";
import test from "node:test";
import {
  generateSessionCredentials,
  hasOnlyKeys,
  hashSessionToken,
  InvalidRequestError,
  isSessionId,
  isSessionToken,
  readLimitedJsonObject,
  sessionTokenMatches,
  utf8ByteLength,
} from "../lib/api-security.ts";

test("generates valid public ids and 32-byte private tokens", () => {
  const session = generateSessionCredentials();

  assert.equal(isSessionId(session.id), true);
  assert.equal(isSessionToken(session.token), true);
  assert.equal(Buffer.from(session.token, "base64url").byteLength, 32);
});

test("matches only the correct token against its SHA-256 hash", () => {
  const session = generateSessionCredentials();
  const other = generateSessionCredentials();
  const storedHash = hashSessionToken(session.token);

  assert.equal(sessionTokenMatches(session.token, storedHash), true);
  assert.equal(sessionTokenMatches(other.token, storedHash), false);
  assert.equal(sessionTokenMatches("not-a-token", storedHash), false);
  assert.equal(sessionTokenMatches(session.token, null), false);
});

test("rejects non-v4 UUIDs and malformed tokens", () => {
  assert.equal(isSessionId("00000000-0000-0000-0000-000000000000"), false);
  assert.equal(isSessionId("../../other-user"), false);
  assert.equal(isSessionToken("short"), false);
  assert.equal(isSessionToken("a".repeat(43)), true);
});

test("bounded JSON reader accepts a small JSON object", async () => {
  const request = new Request("https://pulse.test/api", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ok: true }),
  });

  assert.deepEqual(await readLimitedJsonObject(request, 64), { ok: true });
});

test("bounded JSON reader rejects oversized and non-JSON bodies", async () => {
  const oversized = new Request("https://pulse.test/api", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ value: "x".repeat(80) }),
  });
  await assert.rejects(
    () => readLimitedJsonObject(oversized, 32),
    InvalidRequestError,
  );

  const wrongType = new Request("https://pulse.test/api", {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: "{}",
  });
  await assert.rejects(
    () => readLimitedJsonObject(wrongType, 32),
    InvalidRequestError,
  );
});

test("unknown object keys and multibyte payload sizes are detectable", () => {
  assert.equal(hasOnlyKeys({ toId: "x", type: "end" }, ["toId", "type"]), true);
  assert.equal(
    hasOnlyKeys({ fromId: "spoof", toId: "x" }, ["toId", "type"]),
    false,
  );
  assert.equal(utf8ByteLength("🔒"), 4);
});
