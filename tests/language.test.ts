import assert from "node:assert/strict";
import test from "node:test";

import { isSessionLanguage } from "../lib/language.ts";

test("accepts only supported temporary session languages", () => {
  for (const language of ["en", "fil", "es", "ja"]) {
    assert.equal(isSessionLanguage(language), true);
  }

  assert.equal(isSessionLanguage("EN"), false);
  assert.equal(isSessionLanguage("auto"), false);
  assert.equal(isSessionLanguage(null), false);
});
