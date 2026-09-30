import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// These guard against the exact regression this project already shipped once:
// a Scripture-format section (or devotional anchor line) with no translation
// identified, which silently breaks the copyright-notice-per-quotation
// requirement the disclosures page depends on.

test("creating or editing a Scripture-format section requires a translation", async () => {
  const source = await readFile("app/admin/teachings/content-actions.ts", "utf8");
  assert.match(source, /selectedFormat === "scripture" && !translation\.value/);
  assert.match(source, /Translation is required for a Scripture section/);
});

test("the section editor marks the translation field required for Scripture sections", async () => {
  const source = await readFile("app/admin/teachings/content-workspace.tsx", "utf8");
  assert.match(source, /required=\{selectedFormat === "scripture"\}/);
});

test("ScriptureTranslationLabel links Amplified translations to Lockman and passes other translations through unlinked", async () => {
  const source = await readFile("app/formatted-text.tsx", "utf8");
  assert.match(source, /AMPLIFIED_TRANSLATION_KEYS = new Set\(\["AMP", "AMPC"\]\)/);
  assert.match(source, /href=\{LOCKMAN_FOUNDATION_URL\}/);
  assert.match(source, /LOCKMAN_FOUNDATION_URL = "https:\/\/www\.lockman\.org"/);
});

test("every render site for a Scripture section's translation field uses the shared Lockman-aware label", async () => {
  const sites = [
    "app/teachings/[slug]/page.tsx",
    "app/admin/teachings/callout-utils.tsx",
    "app/admin/teachings/content-workspace.tsx",
    "app/admin/teachings/[id]/print/page.tsx",
  ];

  for (const site of sites) {
    const source = await readFile(site, "utf8");
    const translationInterpolations = source.match(/(?<!translation=)\{String\(value\.translation\)\}/g) ?? [];
    assert.equal(translationInterpolations.length, 0, `${site} renders value.translation directly instead of through ScriptureTranslationLabel`);
    assert.match(source, /ScriptureTranslationLabel translation=\{String\(value\.translation\)\}/, `${site} should render the translation through ScriptureTranslationLabel`);
  }
});

test("public teaching pages render a print-only copyright notice that's hidden on screen but shown when printed to PDF", async () => {
  const [source, css] = await Promise.all([
    readFile("app/teachings/[slug]/page.tsx", "utf8"),
    readFile("app/globals.css", "utf8"),
  ]);

  assert.match(source, /function PrintOnlyCopyrightNotice/);
  assert.match(source, /className="print-only /);
  assert.match(source, /disclaimer_key", "email_short"/);
  assert.match(source, /FALLBACK_EMAIL_COPYRIGHT_DISCLAIMER/);
  assert.match(css, /\.print-only\s*\{\s*display:\s*none;\s*\}/);
  assert.match(css, /@media print[\s\S]*\.print-only\s*\{\s*display:\s*block\s*!important;\s*\}/);
});

test("devotional anchor-scripture lines render through the link-aware formatter, not as raw strings", async () => {
  const sites = [
    "app/devotionals/[slug]/day/[dayNumber]/page.tsx",
    "app/teachings/[slug]/devotional/day/[dayNumber]/page.tsx",
    "app/admin/devotionals/[id]/preview/page.tsx",
    "app/admin/teachings/[id]/devotional/preview/page.tsx",
  ];

  for (const site of sites) {
    const source = await readFile(site, "utf8");
    assert.doesNotMatch(source, /<li key=\{scripture\}>\{scripture\}<\/li>/, `${site} still renders anchor scriptures as raw unlinked strings`);
    assert.match(source, /formatInlineText\(scripture, \{ links: true \}\)/, `${site} should route anchor scriptures through formatInlineText`);
  }
});
