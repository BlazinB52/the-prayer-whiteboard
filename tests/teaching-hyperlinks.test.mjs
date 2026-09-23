import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("teaching content editor can insert links from selected text or new display text", async () => {
  const source = await readFile("app/admin/formatted-textarea.tsx", "utf8");
  assert.match(source, /FormattedTextarea/);
  assert.match(source, /findStoredLinkAtSelection\(value, selectionStart, selectionEnd\)/);
  assert.match(source, /text: value\.slice\(selectionStart, selectionEnd\)/);
  assert.match(source, /Text to display/);
  assert.match(source, /Web address/);
  assert.match(source, /replaceRangeWithStoredLink\(value, linkEditor\.start, linkEditor\.end, linkEditor\.text, linkEditor\.url\)/);
});

test("teaching content editor can edit or remove existing stored links", async () => {
  const source = await readFile("app/admin/formatted-textarea.tsx", "utf8");
  assert.match(source, /isExisting: true/);
  assert.match(source, /Update link/);
  assert.match(source, /Remove link/);
  assert.match(source, /removeStoredLink\(value, linkEditor\.start, linkEditor\.end\)/);
});

test("shared formatted textarea exposes bold, italic, bullets, and link controls", async () => {
  const source = await readFile("app/admin/formatted-textarea.tsx", "utf8");
  assert.match(source, /applyEmphasis\("\*\*"\)/);
  assert.match(source, /applyEmphasis\("\*"\)/);
  assert.match(source, /toggleStoredBulletLines\(value, start, end\)/);
  assert.match(source, />Bullets<\/button>/);
  assert.match(source, /openLinkEditor/);
});

test("link storage is lightweight and validates only http and https URLs", async () => {
  const source = await readFile("app/formatted-text.tsx", "utf8");
  assert.match(source, /return `\[\$\{label\}\]\(\$\{safeUrl\}\)`/);
  assert.match(source, /\^https\?:\\\/\\\//);
  assert.match(source, /parsed\.protocol === "http:" \|\| parsed\.protocol === "https:"/);
  assert.doesNotMatch(source, /dangerouslySetInnerHTML/);
});

test("bullet storage uses safe leading dash lines and renders as lists", async () => {
  const formatter = await readFile("app/formatted-text.tsx", "utf8");
  assert.ok(formatter.includes("const BULLET_PATTERN = /^-\\s+(.+)$/;"));
  assert.match(formatter, /toggleStoredBulletLines/);
  assert.ok(formatter.includes('return line.replace(/^(\\s*)-\\s+/, "$1");'));
  assert.ok(formatter.includes('return line.replace(/^(\\s*)/, "$1- ");'));
  assert.match(formatter, /splitFormattedTextBlocks/);
  assert.match(formatter, /<ul key=\{`list-\$\{index\}`\} className=\{listClassName\}>/);
  assert.match(formatter, /formatInlineText\(item, \{ links \}\)/);
  assert.doesNotMatch(formatter, /dangerouslySetInnerHTML/);
});

test("valid links render as safe anchors and unsafe stored links render as text", async () => {
  const source = await readFile("app/formatted-text.tsx", "utf8");
  assert.match(source, /<a key=\{`\$\{match\.index\}-\$\{safeUrl\}`\} href=\{safeUrl\} target="_blank" rel="noopener noreferrer" className="formatted-link">/);
  assert.match(source, /parts\.push\(\.\.\.formatEmphasis\(label\)\)/);
});

test("bold and italic formatting still works inside and outside links", async () => {
  const source = await readFile("app/formatted-text.tsx", "utf8");
  assert.match(source, /const EMPHASIS_PATTERN = /);
  assert.match(source, /token\.startsWith\("\*\*"\)/);
  assert.match(source, /<strong key=\{`\$\{match\.index\}-\$\{token\}`\}>\{token\.slice\(2, -2\)\}<\/strong>/);
  assert.match(source, /<em key=\{`\$\{match\.index\}-\$\{token\}`\}>\{token\.slice\(1, -1\)\}<\/em>/);
  assert.match(source, /\{formatEmphasis\(label\)\}/);
});

test("teaching public, admin preview, and printable output opt into link rendering", async () => {
  const publicTeaching = await readFile("app/teachings/[slug]/page.tsx", "utf8");
  const editorPreview = await readFile("app/admin/teachings/content-workspace.tsx", "utf8");
  const calloutPreview = await readFile("app/admin/teachings/callout-utils.tsx", "utf8");
  const printPreview = await readFile("app/admin/teachings/[id]/print/page.tsx", "utf8");
  assert.match(publicTeaching, /formatInlineText\([^)]*, \{ links: true \}\)/);
  assert.match(editorPreview, /formatInlineText\([^)]*, \{ links: true \}\)/);
  assert.match(calloutPreview, /formatInlineText\([^)]*, \{ links: true \}\)/);
  assert.match(printPreview, /formatInlineText\([^)]*, \{ links: true \}\)/);
});

test("footer and devotional prose editors reuse the shared formatted textarea", async () => {
  const footerForm = await readFile("app/admin/footers/footer-form.tsx", "utf8");
  const teachingForm = await readFile("app/admin/teachings/teaching-form.tsx", "utf8");
  const devotionalEditor = await readFile("app/admin/teachings/[id]/devotional/devotional-editor.tsx", "utf8");
  assert.match(footerForm, /<FormattedTextarea label="Displayed content"/);
  assert.match(teachingForm, /<FormattedTextarea label="Introduction"/);
  assert.match(teachingForm, /<FormattedTextarea label="Short summary"/);
  assert.match(devotionalEditor, /<FormattedTextarea label="Introduction"/);
  assert.match(devotionalEditor, /<FormattedTextarea label="Devotional Reading"/);
  assert.match(devotionalEditor, /<FormattedTextarea label="Today's Confession"/);
  assert.match(devotionalEditor, /<FormattedTextarea label="5-Minute Journal Prompt"/);
  assert.match(devotionalEditor, /<FormattedTextarea label="Prayer Activation Exercise"/);
});

test("print CSS keeps links underlined without appending URL text", async () => {
  const source = await readFile("app/globals.css", "utf8");
  assert.match(source, /\.formatted-link\s*\{/);
  assert.match(source, /text-decoration: underline/);
  assert.match(source, /\.formatted-link::after\s*\{\s*content: "" !important;/s);
  assert.doesNotMatch(source, /attr\(href\)/);
});
