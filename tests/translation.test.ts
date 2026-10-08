import test from "node:test";
import assert from "node:assert/strict";
import {
  detectLanguage,
  translateText,
  SUPPORTED_TRANSLATION_LANGUAGES,
} from "../lib/translation.ts";

test("detectLanguage identifies supported languages accurately", () => {
  assert.equal(detectLanguage("Hello how are you today?"), "en");
  assert.equal(detectLanguage("Kumusta ka? Salamat sa tulong."), "fil");
  assert.equal(detectLanguage("¡Hola! ¿Cómo estás? Muchas gracias."), "es");
  assert.equal(detectLanguage("こんにちは！お元気ですか？"), "ja");
});

test("translateText translates common phrases across supported languages", async () => {
  const result1 = await translateText("Kumusta ka?", "en", "fil");
  assert.equal(result1.translatedText, "How are you?");
  assert.equal(result1.targetLang, "en");

  const result2 = await translateText("Thank you", "fil", "en");
  assert.equal(result2.translatedText, "Salamat");

  const result3 = await translateText("Hello", "es", "en");
  assert.equal(result3.translatedText, "Hola");

  const result4 = await translateText("Thank you", "ja", "en");
  assert.equal(result4.translatedText, "ありがとうございます");
});

test("translateText returns identical text if source and target are the same", async () => {
  const res = await translateText("Hello friend", "en", "en");
  assert.equal(res.translatedText, "Hello friend");
});

test("supports all four core conversation languages", () => {
  const keys = Object.keys(SUPPORTED_TRANSLATION_LANGUAGES);
  assert.deepEqual(keys.sort(), ["en", "es", "fil", "ja"].sort());
});
