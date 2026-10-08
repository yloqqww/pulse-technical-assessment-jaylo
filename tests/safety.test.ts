import assert from "node:assert/strict";
import test from "node:test";
import { isSafetyAction, isSafetyReportReason } from "../lib/safety.ts";

test("allows only supported safety actions", () => {
  assert.equal(isSafetyAction("block"), true);
  assert.equal(isSafetyAction("report"), true);
  assert.equal(isSafetyAction("ban"), false);
});

test("allows only explicit report reasons", () => {
  for (const reason of ["harassment", "sexual", "hate", "threats", "spam", "other"]) {
    assert.equal(isSafetyReportReason(reason), true);
  }
  assert.equal(isSafetyReportReason("custom text"), false);
  assert.equal(isSafetyReportReason("HARASSMENT"), false);
});
