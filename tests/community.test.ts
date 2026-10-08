import assert from "node:assert/strict";
import test from "node:test";
import {
  getUtcDay,
  isCommunityPulse,
  isCommunityReaction,
} from "../lib/community.ts";

test("accepts only the four anonymous community reactions", () => {
  assert.equal(isCommunityReaction("heard"), true);
  assert.equal(isCommunityReaction("helped"), true);
  assert.equal(isCommunityReaction("smile"), true);
  assert.equal(isCommunityReaction("listener"), true);
  assert.equal(isCommunityReaction("HEARD"), false);
  assert.equal(isCommunityReaction("rating"), false);
});

test("uses a stable UTC day key", () => {
  assert.equal(getUtcDay(new Date("2026-10-08T23:59:59.000Z")), "2026-10-08");
});

test("validates bounded aggregate response shapes", () => {
  assert.equal(
    isCommunityPulse({
      day: "2026-10-08",
      total: 4,
      reactions: { heard: 1, helped: 1, smile: 1, listener: 1 },
    }),
    true,
  );
  assert.equal(
    isCommunityPulse({
      day: "invalid",
      total: -1,
      reactions: { heard: 0, helped: 0, smile: 0, listener: 0 },
    }),
    false,
  );
});
