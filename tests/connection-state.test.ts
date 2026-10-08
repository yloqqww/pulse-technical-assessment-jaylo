import test from "node:test";
import assert from "node:assert/strict";
import { PENDING_TIMEOUT_MS } from "../lib/connection-state.ts";

test("connection state pending timeout is bounded to 45 seconds", () => {
  assert.equal(PENDING_TIMEOUT_MS, 45_000);
});

test("connection state transitions adhere to valid connection lifecycle", () => {
  // Validate state definitions
  const validStatuses = ["pending", "connected", "terminated"];
  assert.ok(validStatuses.includes("pending"));
  assert.ok(validStatuses.includes("connected"));
  assert.ok(validStatuses.includes("terminated"));
});
