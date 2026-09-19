import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { getDevotionalSenderFormId } from "../lib/devotional-sender-forms.ts";

test("each published devotional slug selects its own Sender form", () => {
  assert.equal(getDevotionalSenderFormId("aliyah-israel-the-harvest-and-prayer"), "dyPEr6");
  assert.equal(getDevotionalSenderFormId("beyond-the-garden"), "bmZoWn");
  assert.equal(getDevotionalSenderFormId("5787-the-year-of-the-spoken-word-and-divine-rest"), "elYnWV");
  assert.equal(getDevotionalSenderFormId("unmapped-devotional"), null);
});

test("legacy Sender forms remain configured while public start routes use unified signup", async () => {
  const [slugRoute, genericRoute, universalScript, senderForm] = await Promise.all([
    readFile("app/devotionals/[slug]/start/page.tsx", "utf8"),
    readFile("app/devotionals/start/page.tsx", "utf8"),
    readFile("app/sender-universal-script.tsx", "utf8"),
    readFile("app/devotionals/start/subscription-form.tsx", "utf8"),
  ]);

  assert.match(slugRoute, /getPublishedDevotionalSeriesBySlug\(slug\)/);
  assert.match(slugRoute, /redirect\(getDevotionalStartPath\(series\)\)/);
  assert.match(genericRoute, /getPublishedDevotionalSeries\(\)/);
  assert.match(genericRoute, /redirect\(getDevotionalStartPath\(series\)\)/);
  assert.match(universalScript, /sender\('7fbd75617e6215'\)/);
  assert.match(senderForm, /data-sender-form-id=\{formId\}/);
});
