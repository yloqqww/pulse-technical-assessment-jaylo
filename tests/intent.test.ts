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

test("smart match returns only an available peer with the same intent and language", () => {
  const peers = [
    { id: "busy-talk", intent: "talk" as const, language: "en", busy: true },
    { id: "available-listen", intent: "listen" as const, language: "en", busy: false },
    { id: "filipino-talk", intent: "talk" as const, language: "fil", busy: false },
    { id: "first-talk", intent: "talk" as const, language: "en", busy: false },
    { id: "second-talk", intent: "talk" as const, language: "en", busy: false },
  ];

  assert.equal(pickIntentMatch(peers, "talk", "en", () => 0)?.id, "first-talk");
  assert.equal(pickIntentMatch(peers, "talk", "en", () => 0.99)?.id, "second-talk");
  assert.equal(pickIntentMatch(peers, "talk", "fil", () => 0)?.id, "filipino-talk");
  assert.equal(pickIntentMatch(peers, "celebrate", "en", () => 0), null);
});
