import assert from "node:assert/strict";
import test from "node:test";

import {
  isChatReaction,
  isValidMessageId,
  isValidPeerChatMessage,
  isValidPeerCaption,
  isValidReply,
} from "../lib/webrtc.ts";

const messageId = "8e28cce4-7846-4c4f-87a1-a3ae7b4a4a77";

test("accepts only allowlisted chat reactions", () => {
  assert.equal(isChatReaction("heart"), true);
  assert.equal(isChatReaction("surprised"), true);
  assert.equal(isChatReaction("fire"), false);
  assert.equal(isChatReaction("<script>"), false);
});

test("accepts only bounded live caption payloads", () => {
  assert.equal(isValidPeerCaption({ text: "Hello", final: false }), true);
  assert.equal(isValidPeerCaption({ text: "", final: true }), false);
  assert.equal(isValidPeerCaption({ text: "x".repeat(769), final: true }), false);
  assert.equal(isValidPeerCaption({ text: "Hello", final: "yes" }), false);
});

test("validates shared ephemeral message IDs", () => {
  assert.equal(isValidMessageId(messageId), true);
  assert.equal(isValidMessageId("local-12"), false);
  assert.equal(isValidMessageId(""), false);
});

test("validates reply metadata without trusting peer payloads", () => {
  assert.equal(
    isValidReply({ messageId, preview: "A short reply preview", mine: true }),
    true,
  );
  assert.equal(
    isValidReply({ messageId, preview: "x".repeat(513), mine: false }),
    false,
  );
  assert.equal(
    isValidReply({ messageId: "not-a-uuid", preview: "Hello", mine: true }),
    false,
  );
});

test("validates reply-aware chat messages and enforces text bounds", () => {
  assert.equal(
    isValidPeerChatMessage({
      id: messageId,
      text: "Hello",
      replyTo: { messageId, preview: "Earlier message", mine: false },
    }),
    true,
  );
  assert.equal(isValidPeerChatMessage({ id: messageId, text: "   " }), false);
  assert.equal(
    isValidPeerChatMessage({ id: messageId, text: "x".repeat(4 * 1024 + 1) }),
    false,
  );
});
