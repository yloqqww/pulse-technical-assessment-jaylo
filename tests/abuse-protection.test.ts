import test from "node:test";
import assert from "node:assert/strict";
import { hashClientIdentifier } from "../lib/abuse-protection.ts";
import type { NextRequest } from "next/server";

test("hashClientIdentifier produces anonymized one-way hash without raw IP", () => {
  const dummyRequest = {
    headers: new Headers({
      "x-forwarded-for": "203.0.113.195, 198.51.100.1",
    }),
  } as unknown as NextRequest;

  const hash1 = hashClientIdentifier(dummyRequest, "join");
  const hash2 = hashClientIdentifier(dummyRequest, "join");
  const hashPoll = hashClientIdentifier(dummyRequest, "poll");

  // Output must start with client_
  assert.ok(hash1.startsWith("client_"));
  // Deterministic for the same IP + action
  assert.equal(hash1, hash2);
  // Scoped differently per action
  assert.notEqual(hash1, hashPoll);
  // Raw IP is NEVER contained in the output hash string!
  assert.ok(!hash1.includes("203.0.113.195"));
  assert.ok(!hash1.includes("198.51.100.1"));
});

test("handles empty or missing proxy headers safely with loopback fallback", () => {
  const emptyRequest = {
    headers: new Headers(),
  } as unknown as NextRequest;

  const hash = hashClientIdentifier(emptyRequest, "join");
  assert.ok(hash.startsWith("client_"));
  assert.ok(!hash.includes("127.0.0.1"));
});
