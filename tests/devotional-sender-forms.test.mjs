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

test("slug and generic signup routes resolve a devotional before selecting its form", async () => {
  const [slugRoute, genericRoute, universalScript] = await Promise.all([
    readFile("app/devotionals/[slug]/start/page.tsx", "utf8"),
    readFile("app/devotionals/start/page.tsx", "utf8"),
    readFile("app/sender-universal-script.tsx", "utf8"),
  ]);

  assert.match(slugRoute, /getPublishedDevotionalSeriesBySlug\(slug\)/);
  assert.match(slugRoute, /getDevotionalSenderFormId\(series\.slug\)/);
  assert.match(genericRoute, /getPublishedDevotionalSeries\(\)/);
  assert.match(genericRoute, /getDevotionalSenderFormId\(series\.slug\)/);
  assert.match(universalScript, /sender\('7fbd75617e6215'\)/);
});
