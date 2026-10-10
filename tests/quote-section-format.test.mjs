import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parseTeachingDocxParts, toSectionContent } from "../lib/teaching-docx-import.ts";
import { buildEditableFields } from "../lib/teaching-revisions.ts";
import { parts, validTeaching } from "./teaching-docx-fixture.mjs";

const parse = (paragraphs) => parseTeachingDocxParts(parts(paragraphs));

test("a paragraph in the Quote style becomes its own plain quote section, with no reference or translation", () => {
  const paragraphs = validTeaching();
  paragraphs.push(["Quote", "We do not have to manufacture glory. We ", { t: "behold", i: true }, " the Lord."]);
  paragraphs.push(["Quote", "A second quote."]);
  const result = parse(paragraphs);
  assert.equal(result.ok, true, result.errors.join("\n"));
  const quotes = result.teaching.categories.flatMap((category) => category.sections).filter((section) => section.format === "quote");
  assert.deepEqual(quotes.map((section) => section.text), ["We do not have to manufacture glory. We *behold* the Lord.", "A second quote."]);
  assert.deepEqual(Object.keys(quotes[0]).sort(), ["format", "showTitle", "text", "title"], "no reference, translation or copyright fields");
  assert.match(quotes[0].title, /Quote 1/, "hidden titles are numbered by kind");
  assert.deepEqual(toSectionContent(quotes[0]), { version: 1, format: "quote", text: "We do not have to manufacture glory. We *behold* the Lord.", showTitle: false });
});

test("a Quote paragraph is not flagged as an unsupported style any more", () => {
  const paragraphs = validTeaching();
  paragraphs.push(["Quote", "A pull quote."]);
  const result = parse(paragraphs);
  assert.equal(result.warnings.some((message) => /Quote/.test(message) && /not be imported/.test(message)), false);
});

test("the teaching review lets a co-editor proofread a quote's text, labelled Quote", () => {
  const teaching = { id: "t", title: "T", central_theme: null, introduction: null, summary: null, teaser_1_heading: null, teaser_1_text: null, teaser_2_heading: null, teaser_2_text: null };
  const fields = buildEditableFields(teaching, [{ id: "c1", title: "Faithful", sort_order: 1 }], [{ id: "s1", category_id: "c1", title: "Set apart", sort_order: 1, content: { format: "quote", text: "A quote." } }]);
  const text = fields.find((field) => field.fieldKey === "text");
  assert.equal(text.label, "Quote text");
  assert.equal(text.context, "Faithful › Set apart (Quote)");
  assert.equal(text.current, "A quote.");
});

test("the quote block is a gold left line, slightly indented, upright, with no reference or copyright", async () => {
  const source = await readFile("app/quote-block.tsx", "utf8");
  const block = source.split("\n").filter((line) => !line.trim().startsWith("//")).join("\n");
  assert.match(block, /border-l-4 border-\[#c99a52\]/);
  assert.match(block, /ml-4/);
  assert.doesNotMatch(block, /italic|font-bold|font-extrabold|Translation|copyright/i);
});

test("the editor offers Quote, saves it as plain text, and every place that shows a section renders it", async () => {
  const workspace = await readFile("app/admin/teachings/content-workspace.tsx", "utf8");
  assert.match(workspace, /<option value="quote">Quote \(gold line\)<\/option>/);
  assert.match(workspace, /value\.format === "quote" \? <QuoteBlock>/);
  const actions = await readFile("app/admin/teachings/content-actions.ts", "utf8");
  assert.match(actions, /\["paragraph", "bullets", "scripture", "takeaway", "quote"\]\.includes\(value\)/);
  for (const file of ["app/teachings/[slug]/page.tsx", "app/admin/teachings/callout-utils.tsx"]) {
    assert.match(await readFile(file, "utf8"), /<QuoteBlock>/, `${file} renders a quote with the quote block`);
  }
  const print = await readFile("app/admin/teachings/[id]/print/page.tsx", "utf8");
  assert.match(print, /value\.format === "quote"/);
  assert.match(print, /border-l-4 border-\[#c99a52\]/);
});

test("publishing and review recognise the quote format in the database", async () => {
  const sql = await readFile("supabase/migrations/20261010030000_teaching_quote_section_format.sql", "utf8");
  assert.match(sql, /not in \('paragraph', 'takeaway', 'quote', 'bullets', 'scripture'\)/);
  assert.match(sql, /content->>'format' in \('paragraph', 'takeaway', 'quote'\)/);
  assert.match(sql, /v_format in \('paragraph', 'takeaway', 'quote'\)/);
  assert.match(sql, /grant execute on function public\.publish_and_feature_teaching\(uuid\) to authenticated/);
  assert.match(sql, /revoke all on function public\.revision_field_info\(uuid, text, uuid, text\) from public, anon, authenticated/);
});
