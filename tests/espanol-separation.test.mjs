import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Español teachings are never emailed to the English subscriber list", async () => {
  const source = await readFile("lib/teaching-broadcast.ts", "utf8");
  const languageGuard = source.indexOf('teaching.language !== "en"');
  assert.ok(languageGuard > -1, "broadcastTeaching must skip non-English teachings");
  assert.ok(languageGuard < source.indexOf("claimBroadcast(teachingId)"), "the language check must run before the broadcast is claimed");
});

test("the daily devotional email skips Español series", async () => {
  const source = await readFile("lib/devotional-send.ts", "utf8");
  assert.match(source, /getSpanishDevotionalIds\(supabase\)/);
  assert.match(source, /!spanishIds\.has\(candidate\.id\)/);
});

test("English public pages only list English content", async () => {
  const [home, deepDives] = await Promise.all([readFile("app/page.tsx", "utf8"), readFile("app/deep-dives/page.tsx", "utf8")]);
  assert.equal(home.match(/\.eq\("language", "en"\)/g)?.length, 4);
  assert.match(deepDives, /\.eq\("language", "en"\)/);
});

test("the Español homepage only reads Español content", async () => {
  const source = await readFile("lib/espanol-home-data.ts", "utf8");
  assert.equal(source.match(/\.eq\("language", "es"\)/g)?.length, 2);
  assert.match(source, /getPublishedDevotionalSeries\("es"\)/);
});
