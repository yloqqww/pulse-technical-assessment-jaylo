import assert from "node:assert/strict";
import test from "node:test";
import {
  isConversationIntent,
  pickIntentMatch,
} from "../lib/intent.ts";

test("accepts only the four supported conversation intents", () => {
  for (const intent of ["talk", "listen", "advice", "celebrate"]) {
    assert.equal(isConversationIntent(intent), true);
  }

  assert.equal(isConversationIntent("dating"), false);
  assert.equal(isConversationIntent("Talk"), false);
  assert.equal(isConversationIntent(null), false);
});

test("smart match returns only an available peer with the same intent", () => {
  const peers = [
    { id: "busy-talk", intent: "talk" as const, busy: true },
    { id: "available-listen", intent: "listen" as const, busy: false },
    { id: "first-talk", intent: "talk" as const, busy: false },
    { id: "second-talk", intent: "talk" as const, busy: false },
  ];

  assert.equal(pickIntentMatch(peers, "talk", () => 0)?.id, "first-talk");
  assert.equal(pickIntentMatch(peers, "talk", () => 0.99)?.id, "second-talk");
  assert.equal(pickIntentMatch(peers, "celebrate", () => 0), null);
});
