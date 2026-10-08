import test from "node:test";
import assert from "node:assert/strict";
import type { NextRequest } from "next/server";
import {
  DEFAULT_DEV_MODERATOR_KEY,
  verifyModeratorRequest,
  getModeratorKey,
} from "../lib/moderator-auth.ts";

test("getModeratorKey falls back to default dev key when unset", () => {
  const key = getModeratorKey();
  assert.ok(key.length > 0);
  assert.equal(key, process.env.MODERATOR_KEY || process.env.ADMIN_KEY || DEFAULT_DEV_MODERATOR_KEY);
});

test("verifyModeratorRequest accepts valid x-moderator-key header", () => {
  const validReq = {
    headers: new Headers({
      "x-moderator-key": getModeratorKey(),
    }),
    cookies: { get: () => undefined },
  } as unknown as NextRequest;

  assert.equal(verifyModeratorRequest(validReq), true);
});

test("verifyModeratorRequest accepts valid Bearer authorization header", () => {
  const validReq = {
    headers: new Headers({
      authorization: `Bearer ${getModeratorKey()}`,
    }),
    cookies: { get: () => undefined },
  } as unknown as NextRequest;

  assert.equal(verifyModeratorRequest(validReq), true);
});

test("verifyModeratorRequest rejects missing or invalid moderator key", () => {
  const invalidReq = {
    headers: new Headers({
      "x-moderator-key": "wrong-secret-key-123",
    }),
    cookies: { get: () => undefined },
  } as unknown as NextRequest;

  const emptyReq = {
    headers: new Headers(),
    cookies: { get: () => undefined },
  } as unknown as NextRequest;

  assert.equal(verifyModeratorRequest(invalidReq), false);
  assert.equal(verifyModeratorRequest(emptyReq), false);
});
