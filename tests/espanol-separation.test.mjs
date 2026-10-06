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

test("Español teaching and devotional pages use the Español footer and never offer the English subscription", async () => {
  const files = [
    "app/teachings/[slug]/page.tsx",
    "app/teachings/[slug]/devotional/page.tsx",
    "app/teachings/[slug]/devotional/day/[dayNumber]/page.tsx",
    "app/devotionals/[slug]/page.tsx",
    "app/devotionals/[slug]/day/[dayNumber]/page.tsx",
  ];
  for (const file of files) {
    const source = await readFile(file, "utf8");
    assert.match(source, /PublicFooterEs/, `${file} must render the Español footer for Español content`);
    assert.match(source, /variant=\{language\}/, `${file} must switch the header to Español`);
  }
  const teaching = await readFile("app/teachings/[slug]/page.tsx", "utf8");
  assert.match(teaching, /language === "es" \? null : <EmailUpdatesCta/);
  const series = await readFile("app/devotionals/[slug]/page.tsx", "utf8");
  assert.match(series, /language === "es" \? null : <Link href=\{getDevotionalStartPath/);
  const start = await readFile("app/devotionals/[slug]/start/page.tsx", "utf8");
  assert.match(start, /series\.language === "es"/);
});

test("the Español header and footer never link to the English subscription", async () => {
  const header = await readFile("app/public-header.tsx", "utf8");
  const guarded = header.match(/spanish \? null : <Link href="\/subscribe"/g)?.length ?? 0;
  const all = header.match(/<Link href="\/subscribe"/g)?.length ?? 0;
  assert.ok(all > 0);
  assert.equal(guarded, all, "every Subscribe button in the header must be hidden on Español pages");
  const footer = await readFile("app/public-footer-es.tsx", "utf8");
  assert.doesNotMatch(footer, /\/subscribe/);
  assert.doesNotMatch(footer, /href="\/(privacy|copyright-disclaimers|about|devotionals)"/);
});

test("every Español interface string is actually translated", async () => {
  const { ui } = await import("../lib/i18n.ts");
  const en = ui("en");
  const es = ui("es");
  const sameOnPurpose = new Set(["brandEyebrow"]);
  for (const key of Object.keys(en)) {
    if (sameOnPurpose.has(key) || key === "emailCtaCopy") continue;
    const left = typeof en[key] === "function" ? en[key](3) : en[key];
    const right = typeof es[key] === "function" ? es[key](3) : es[key];
    assert.notEqual(right, left, `${key} has no Spanish translation`);
  }
});
