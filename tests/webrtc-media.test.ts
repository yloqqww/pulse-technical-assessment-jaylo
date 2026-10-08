import assert from "node:assert/strict";
import test from "node:test";
import {
  isRecoverableConnectionState,
  isValidAttachmentMetadata,
  isValidCallDuration,
  MAX_ATTACHMENT_BYTES,
} from "../lib/webrtc.ts";

test("starts recovery only for temporary WebRTC failures", () => {
  assert.equal(isRecoverableConnectionState("disconnected"), true);
  assert.equal(isRecoverableConnectionState("failed"), true);
  assert.equal(isRecoverableConnectionState("connecting"), false);
  assert.equal(isRecoverableConnectionState("connected"), false);
  assert.equal(isRecoverableConnectionState("closed"), false);
});

test("accepts bounded ephemeral attachment metadata", () => {
  assert.equal(
    isValidAttachmentMetadata({
      name: "photo.jpg",
      mime: "image/jpeg",
      size: MAX_ATTACHMENT_BYTES,
    }),
    true,
  );
});

test("accepts only bounded whole-second call durations", () => {
  assert.equal(isValidCallDuration(0), true);
  assert.equal(isValidCallDuration(3_661), true);
  assert.equal(isValidCallDuration(-1), false);
  assert.equal(isValidCallDuration(1.5), false);
  assert.equal(isValidCallDuration(7 * 24 * 60 * 60 + 1), false);
});

test("rejects empty, oversized, and malformed attachment metadata", () => {
  assert.equal(
    isValidAttachmentMetadata({ name: "", mime: "image/jpeg", size: 100 }),
    false,
  );
  assert.equal(
    isValidAttachmentMetadata({
      name: "large.mp4",
      mime: "video/mp4",
      size: MAX_ATTACHMENT_BYTES + 1,
    }),
    false,
  );
  assert.equal(
    isValidAttachmentMetadata({ name: "file.txt", mime: "text/plain", size: 1.5 }),
    false,
  );
});
