import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { compareHandouts, handoutEditableFields } from "../lib/handout-revisions.ts";
import { buildReviewReadyEmail, reviewPath } from "../lib/review-ready-email.ts";
import { REVIEW_SUBJECTS, gateTableFor, reviewSubjectKind } from "../lib/review-subjects.ts";
import { formatTeachingDate, formatTeachingDateShort } from "../lib/teaching-date.ts";
import {
  handoutSections,
  parseHandoutDocx,
  parseHandoutDocxParts,
  sectionPlainText,
  suggestHandoutFromFileName,
  validateHandoutDate,
} from "../lib/teaching-handouts.ts";
import { fieldId, parseFieldId } from "../lib/teaching-revisions.ts";

const read = (file) => readFile(file, "utf8");

// ---------------------------------------------------------------------------
// The Word file
// ---------------------------------------------------------------------------

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const STYLES = `<w:styles ${W}>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/></w:style>
<w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/></w:style>
<w:style w:type="paragraph" w:styleId="ListBullet"><w:name w:val="List Bullet"/></w:style>
<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/></w:style>
</w:styles>`;

const run = (text, { b = false, i = false } = {}) => `<w:r>${b || i ? `<w:rPr>${b ? "<w:b/>" : ""}${i ? "<w:i/>" : ""}</w:rPr>` : ""}<w:t xml:space="preserve">${text}</w:t></w:r>`;
const p = (style, ...runs) => `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ""}${runs.join("")}</w:p>`;
const parse = (...paragraphs) => parseHandoutDocxParts({ documentXml: `<w:document ${W}><w:body>${paragraphs.join("")}</w:body></w:document>`, stylesXml: STYLES });

test("each Word style becomes its block, in order", () => {
  const result = parse(
    p("Heading1", run("FROM GLORY", { b: true })),
    p("Subtitle", run("Beholding the Lord", { b: true })),
    p("", run("An opening paragraph.")),
    p("Heading2", run("Joined")),
    p("", run("Lead. ", { b: true }), run("Body.")),
    p("ListBullet", run("Behold. ", { b: true }), run("Look.")),
    p("ListBullet", run("Honor.")),
    p("Quote", run("Arise", { i: true })),
    p("Heading1", run("SECOND")),
  );
  assert.equal(result.ok, true, result.errors.join("; "));
  assert.deepEqual(result.handout.blocks.map((block) => block.type), ["section_title", "subtitle", "paragraph", "paragraph_title", "paragraph", "list", "tagline", "section_title"]);
  assert.equal(result.handout.title, "FROM GLORY");
  assert.equal(result.handout.blocks[5].items.length, 2);
});

test("titles, subtitles and closing lines lose Word's bold and italic; paragraphs and bullets keep theirs", () => {
  const { blocks } = parse(p("Heading1", run("TITLE", { b: true })), p("Quote", run("Line", { i: true })), p("", run("Lead. ", { b: true }), run("Body.")), p("ListBullet", run("Bold. ", { b: true }), run("Text."))).handout;
  assert.deepEqual(blocks[0].inlines, [{ text: "TITLE" }]);
  assert.deepEqual(blocks[1].inlines, [{ text: "Line" }]);
  assert.deepEqual(blocks[2].inlines, [{ text: "Lead. ", bold: true }, { text: "Body." }]);
  assert.deepEqual(blocks[3].items[0].inlines, [{ text: "Bold. ", bold: true }, { text: "Text." }]);
});

test("a divider line and empty paragraphs are dropped", () => {
  const { blocks } = parse(p("Heading1", run("A")), p("", run("━━━━━━━━")), p(""), p("", run("Body."))).handout;
  assert.deepEqual(blocks.map((block) => block.type), ["section_title", "paragraph"]);
});

test("a bullet typed by hand is read as a bullet, with a note", () => {
  const result = parse(p("Heading1", run("A")), p("", run("• ", { b: true }), run("Draw near. ", { b: true }), run("Pray.")));
  assert.equal(result.ok, true);
  assert.equal(result.handout.blocks[1].type, "list");
  assert.deepEqual(result.handout.blocks[1].items[0].inlines, [{ text: "Draw near. ", bold: true }, { text: "Pray." }]);
  assert.match(result.warnings.join(" "), /typed bullet/);
});

test("a document without Heading 1 is refused, and the message says what to do", () => {
  const unstyled = parse(p("", run("FROM GLORY", { b: true })), p("", run("Body.")));
  assert.equal(unstyled.ok, false);
  assert.match(unstyled.errors[0], /bold text, not Heading 1/);
  const plain = parse(p("", run("Just a paragraph.")));
  assert.equal(plain.ok, false);
  assert.match(plain.errors[0], /Heading 1/);
});

test("text before the first section and a table are reported", () => {
  const result = parse(p("", run("Stray.")), "<w:tbl><w:tr><w:tc><w:p/></w:tc></w:tr></w:tbl>", p("Heading1", run("A")));
  assert.match(result.warnings.join(" "), /before the first Heading 1/);
  assert.match(result.warnings.join(" "), /table/);
});

test("a section without a subtitle or paragraph titles is fine", () => {
  const result = parse(p("Heading1", run("ONLY")), p("", run("Body.")));
  assert.equal(result.ok, true);
  assert.equal(result.warnings.length, 0);
});

test("the shipped template reads cleanly and uses every style", () => {
  const result = parseHandoutDocx(readFileSync("docs/handout-template.docx"));
  assert.equal(result.ok, true, result.errors.join("; "));
  assert.deepEqual(result.warnings, []);
  const types = new Set(result.handout.blocks.map((block) => block.type));
  for (const type of ["section_title", "subtitle", "paragraph", "paragraph_title", "list", "tagline"]) assert.ok(types.has(type), type);
});

test("a file that is not a Word document is refused rather than thrown", () => {
  const result = parseHandoutDocx(Buffer.from("not a zip"));
  assert.equal(result.ok, false);
  assert.equal(result.handout, null);
});

// ---------------------------------------------------------------------------
// The file name and the teaching date
// ---------------------------------------------------------------------------

test("the language and the teaching date are read from the front of the file name", () => {
  assert.deepEqual(suggestHandoutFromFileName("en_20261010_handout_draft_text.docx"), { language: "en", date: "2026-10-10", unsupportedLanguage: null });
  assert.deepEqual(suggestHandoutFromFileName("20261010 handout.docx"), { language: null, date: "2026-10-10", unsupportedLanguage: null });
  assert.deepEqual(suggestHandoutFromFileName("es_20261010_x.docx"), { language: null, date: "2026-10-10", unsupportedLanguage: "es" });
  assert.deepEqual(suggestHandoutFromFileName("handout.docx"), { language: null, date: null, unsupportedLanguage: null });
  assert.equal(suggestHandoutFromFileName("en_20261340_x.docx").date, null);
});

test("a handout must have a real teaching date", () => {
  assert.equal(validateHandoutDate("2026-10-10").value, "2026-10-10");
  assert.ok(validateHandoutDate("").error);
  assert.ok(validateHandoutDate("2026-02-30").error);
  assert.ok(validateHandoutDate(undefined).error);
});

test("a teaching date is shown the same way everywhere, without shifting a day", () => {
  assert.equal(formatTeachingDate("2026-10-10"), "Saturday, Oct 10, 2026");
  assert.equal(formatTeachingDateShort("2026-10-10"), "Oct 10, 2026");
  assert.equal(formatTeachingDate(null), "");
  assert.equal(formatTeachingDate("garbage"), "");
});

// ---------------------------------------------------------------------------
// Sections and the copy-out text
// ---------------------------------------------------------------------------

const handout = [
  { type: "section_title", inlines: [{ text: "ONE" }] },
  { type: "subtitle", inlines: [{ text: "Sub" }] },
  { type: "paragraph", inlines: [{ text: "Open." }] },
  { type: "paragraph_title", inlines: [{ text: "Joined" }] },
  { type: "list", items: [{ level: 0, ordered: false, inlines: [{ text: "Lead. ", bold: true }, { text: "Text." }] }, { level: 0, ordered: false, inlines: [{ text: "Two." }] }] },
  { type: "tagline", inlines: [{ text: "Arise" }] },
  { type: "section_title", inlines: [{ text: "TWO" }] },
  { type: "paragraph", inlines: [{ text: "Body." }] },
];

test("blocks are grouped into sections", () => {
  const sections = handoutSections(handout);
  assert.equal(sections.length, 2);
  assert.deepEqual(sections[0].subtitle, [{ text: "Sub" }]);
  assert.equal(sections[0].body.length, 4);
  assert.equal(sections[1].subtitle, null);
});

test("a section's plain text is ready to paste", () => {
  assert.equal(sectionPlainText(handoutSections(handout)[0]), "ONE\nSub\n\nOpen.\n\nJoined\n\n• Lead. Text.\n• Two.\n\nArise");
});

// ---------------------------------------------------------------------------
// Review fields and comparison
// ---------------------------------------------------------------------------

test("fields from the database become review fields for a handout", () => {
  const fields = handoutEditableFields([
    { field_key: "block_3", label: "Opening paragraph", context: "Section 1: ONE", current_value: "**Hi** there", max_length: 12000, multiline: true, field_rows: 3, formatted: true },
  ]);
  assert.equal(fields[0].targetKind, "handout");
  assert.equal(fields[0].id, "handout:-:block_3");
  assert.deepEqual(handoutEditableFields(null), []);
  assert.deepEqual(parseFieldId(fieldId("handout", null, "block_6_item_2")), { targetKind: "handout", targetId: null, fieldKey: "block_6_item_2" });
});

test("the comparison with the upload reports only places whose wording differs", () => {
  const changed = structuredClone(handout);
  changed[4].items[1].inlines = [{ text: "Two changed." }];
  assert.equal(compareHandouts(handout, handout).differences.length, 0);
  assert.deepEqual(compareHandouts(handout, changed).differences, [{ key: "block_5_item_2", original: "Two.", current: "Two changed." }]);
});

// ---------------------------------------------------------------------------
// Wiring: the one list of reviewed kinds, the email, the pages
// ---------------------------------------------------------------------------

test("handouts are a reviewed kind with the Administrator's gate", () => {
  assert.equal(REVIEW_SUBJECTS.handout.reviewFolder, "handout-review");
  assert.equal(REVIEW_SUBJECTS.handout.adminPath("abc"), "/admin/handouts/abc");
  assert.equal(REVIEW_SUBJECTS.handout.reviewOneRpc, "review_handout_revision_change");
  assert.equal(REVIEW_SUBJECTS.handout.reviewAllRpc, "review_all_handout_revision_changes");
  assert.equal(gateTableFor("handout"), "teaching_handouts");
  assert.equal(reviewSubjectKind("handout"), "handout");
});

test("the review email and link work for a handout", () => {
  assert.equal(reviewPath("handout", "id1"), "/admin/cm/handout-review/id1");
  const email = buildReviewReadyEmail({ kind: "handout", title: "From Glory (teaching of Oct 10, 2026)", reviewUrl: "https://example.com/admin/cm/handout-review/id1" });
  assert.match(email.html, /sent you a handout to review/);
  assert.equal(email.subject, "Ready for your review: From Glory (teaching of Oct 10, 2026)");
});

test("the migration defines every function the registry names, and the date is required", async () => {
  const sql = await read("supabase/migrations/20261013000000_handout_review.sql");
  for (const name of [REVIEW_SUBJECTS.handout.reviewOneRpc, REVIEW_SUBJECTS.handout.reviewAllRpc, "create_handout_revision", "save_handout_revision_draft", "submit_handout_revision", "handout_review_fields", "admin_edit_handout_text", "admin_handout_structure"]) {
    assert.match(sql, new RegExp(`create or replace function public\\.${name}\\(`), name);
  }
  assert.match(sql, /gathering_date date not null/);
  assert.match(sql, /constraint teaching_handouts_status_check check \(status = 'draft'\)/);
});

test("only an Administrator uploads, edits and deletes; Content Managers only propose", async () => {
  for (const file of ["app/admin/handouts/actions.ts", "app/admin/handouts/[id]/edit-text/actions.ts"]) {
    const source = await read(file);
    assert.match(source, /requireAdmin\(\)/, file);
    assert.doesNotMatch(source, /requireContentManager/, file);
  }
  const cm = await read("app/admin/cm/handout-review/actions.ts");
  assert.match(cm, /requireContentManager\(\)/);
  assert.doesNotMatch(cm, /\.from\("teaching_handouts"\)\s*\.(insert|update|delete)/);
});

test("the teaching date shows on the lists, the review page and the Revisions screen", async () => {
  for (const file of ["app/admin/handouts/page.tsx", "app/admin/handouts/[id]/page.tsx", "app/admin/cm/handout-review/page.tsx", "app/admin/cm/handout-review/[id]/page.tsx", "app/admin/teaching-revisions/[revisionId]/page.tsx"]) {
    assert.match(await read(file), /TeachingDateLabel/, file);
  }
});

test("the dashboards link to handouts", async () => {
  assert.match(await read("app/admin/page.tsx"), /href: "\/admin\/handouts"/);
  assert.match(await read("app/admin/cm/page.tsx"), /href: "\/admin\/cm\/handout-review"/);
});
