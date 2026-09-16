import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("teaching content editor can insert links from selected text or new display text", async () => {
  const source = await readFile("app/admin/teachings/content-workspace.tsx", "utf8");
  assert.match(source, /FormattedTextarea/);
  assert.match(source, /findStoredLinkAtSelection\(value, selectionStart, selectionEnd\)/);
  assert.match(source, /text: value\.slice\(selectionStart, selectionEnd\)/);
  assert.match(source, /Text to display/);
  assert.match(source, /Web address/);
  assert.match(source, /replaceRangeWithStoredLink\(value, linkEditor\.start, linkEditor\.end, linkEditor\.text, linkEditor\.url\)/);
});

test("teaching content editor can edit or remove existing stored links", async () => {
  const source = await readFile("app/admin/teachings/content-workspace.tsx", "utf8");
  assert.match(source, /isExisting: true/);
  assert.match(source, /Update link/);
  assert.match(source, /Remove link/);
  assert.match(source, /removeStoredLink\(value, linkEditor\.start, linkEditor\.end\)/);
});

test("link storage is lightweight and validates only http and https URLs", async () => {
  const source = await readFile("app/formatted-text.tsx", "utf8");
  assert.match(source, /return `\[\$\{label\}\]\(\$\{safeUrl\}\)`/);
  assert.match(source, /\^https\?:\\\/\\\//);
  assert.match(source, /parsed\.protocol === "http:" \|\| parsed\.protocol === "https:"/);
  assert.doesNotMatch(source, /dangerouslySetInnerHTML/);
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

test("print CSS keeps links underlined without appending URL text", async () => {
  const source = await readFile("app/globals.css", "utf8");
  assert.match(source, /\.formatted-link\s*\{/);
  assert.match(source, /text-decoration: underline/);
  assert.match(source, /\.formatted-link::after\s*\{\s*content: "" !important;/s);
  assert.doesNotMatch(source, /attr\(href\)/);
});
