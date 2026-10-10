import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { groupScriptureEntries, stripWrappingQuotes } from "../lib/anchor-scripture-format.ts";

// One standard for every verse: bold reference, the verse directly under it in italics, and a gold
// line down the left edge. Every place that shows a verse goes through app/scripture-block.tsx.

const sites = [
  "app/teachings/[slug]/page.tsx",
  "app/admin/teachings/callout-utils.tsx",
  "app/admin/teachings/content-workspace.tsx",
  "app/points-of-agreement/page.tsx",
  "app/those-in-authority/leader-grid.tsx",
];

test("the verse component is bold reference, italic verse right under it, gold left line", async () => {
  const source = await readFile("app/scripture-block.tsx", "utf8");
  assert.match(source, /border-l-4/);
  assert.match(source, /border-\[#c99a52\]/);
  assert.match(source, /font-extrabold/);
  assert.match(source, /mt-1 /, "the verse sits close under its reference");
  assert.match(source, /italic/);
});

test("every place that shows a verse uses the standard component", async () => {
  for (const file of sites) {
    const source = await readFile(file, "utf8");
    assert.match(source, /<ScriptureBlock|<ScriptureList/, `${file} shows verses with the standard component`);
    assert.doesNotMatch(source, /border-\[#d9d9d9\]/, `${file} no longer uses the old gray bar`);
  }
});

test("the print page marks a verse with the same gold line and italic text", async () => {
  const source = await readFile("app/admin/teachings/[id]/print/page.tsx", "utf8");
  assert.match(source, /border-l-4 border-\[#c99a52\]/);
  assert.match(source, /italic/);
});

test("anchor scriptures are grouped into a reference and a verse, whatever shape they were stored in", () => {
  assert.deepEqual(groupScriptureEntries(['Hebrews 12:2 (NIV) — "Fixing our eyes."']), [{ reference: "Hebrews 12:2 (NIV)", quote: '"Fixing our eyes."' }]);
  assert.deepEqual(groupScriptureEntries(["Hebrews 12:2 (NIV)", '"Fixing our eyes."', "**Proverbs 4:20-23 (NKJV)**", '"My son."']), [
    { reference: "Hebrews 12:2 (NIV)", quote: '"Fixing our eyes."' },
    { reference: "Proverbs 4:20-23 (NKJV)", quote: '"My son."' },
  ]);
  assert.deepEqual(groupScriptureEntries(['Hebrews 12:2 (NIV)\n"Fixing our eyes."']), [{ reference: "Hebrews 12:2 (NIV)", quote: '"Fixing our eyes."' }]);
  assert.deepEqual(groupScriptureEntries(['"Quote."', "- John 3:16 (KJV)"]), [{ reference: "John 3:16 (KJV)", quote: '"Quote."' }]);
  assert.deepEqual(groupScriptureEntries(['Salmos 23:1-3 (RVR1960): "Jehová es mi pastor."']), [{ reference: "Salmos 23:1-3 (RVR1960)", quote: '"Jehová es mi pastor."' }]);
  assert.deepEqual(groupScriptureEntries(["Isaiah 35:10"]), [{ reference: "Isaiah 35:10", quote: "" }], "a lone reference is not turned into an italic verse");
  assert.deepEqual(groupScriptureEntries(["Some plain words."]), [{ reference: null, quote: "Some plain words." }]);
});

test("wording is never changed; only one pair of quote marks around a whole verse is dropped for display", () => {
  assert.equal(stripWrappingQuotes('"Launch out."'), "Launch out.");
  assert.equal(stripWrappingQuotes("“Launch out.”"), "Launch out.");
  assert.equal(stripWrappingQuotes('"First." and "second."'), '"First." and "second."');
  assert.equal(stripWrappingQuotes("No quotes here."), "No quotes here.");
});
