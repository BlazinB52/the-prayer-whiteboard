import assert from "node:assert/strict";
import test from "node:test";
import { formatAnchorScriptures } from "../lib/anchor-scripture-format.ts";
import { normalizeScriptureLines } from "../lib/devotionals.ts";

test("a quote line followed by a dashed reference line becomes one reference-first entry", () => {
  assert.deepEqual(
    formatAnchorScriptures(['"I will give you a new heart."', "- Ezekiel 36:26 (NIV)", '"Not to us, Lord."', "- Psalm 115:1 (NIV)"]),
    ['Ezekiel 36:26 (NIV) \u2014 "I will give you a new heart."', 'Psalm 115:1 (NIV) \u2014 "Not to us, Lord."'],
  );
});

test("colon and hyphen separators become an em dash, curly quotes are kept", () => {
  assert.deepEqual(formatAnchorScriptures(['Proverbs 18:21 (KJV): "Death and life."']), ['Proverbs 18:21 (KJV) \u2014 "Death and life."']);
  assert.deepEqual(formatAnchorScriptures(['2 Corinthians 4:7 (NIV)  - "But we have this treasure."']), ['2 Corinthians 4:7 (NIV) \u2014 "But we have this treasure."']);
  assert.deepEqual(formatAnchorScriptures(["Isaiah 43:18\u201319 (NKJV): \u201CDo not remember.\u201D"]), ["Isaiah 43:18\u201319 (NKJV) \u2014 \u201CDo not remember.\u201D"]);
});

test("spaces just inside the quotation marks are trimmed; wording is untouched", () => {
  assert.deepEqual(formatAnchorScriptures(['" I keep asking. "', "- Ephesians 1:17-19 (NIV)"]), ['Ephesians 1:17-19 (NIV) \u2014 "I keep asking."']);
});

test("already formatted entries and plain lines are left alone (idempotent)", () => {
  const done = ['Romans 8:1 (ESV) \u2014 "There is therefore now no condemnation."', "Romans 8:2"];
  assert.deepEqual(formatAnchorScriptures(done), done);
  assert.deepEqual(formatAnchorScriptures(formatAnchorScriptures(['"Q."', "- John 1:1 (NIV)"])), ['John 1:1 (NIV) \u2014 "Q."']);
});

test("the editor and importer line normalizer applies the format", () => {
  assert.deepEqual(normalizeScriptureLines('"A quote."\n- Mark 1:1 (NIV)\n'), ['Mark 1:1 (NIV) \u2014 "A quote."']);
});
