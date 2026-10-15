import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildReviewReadyEmail, reviewPath } from "../lib/review-ready-email.ts";
import { compareOutlines, outlineEditableFields, outlineTexts } from "../lib/outline-revisions.ts";
import { REVIEW_SUBJECTS, REVIEW_SUBJECT_KINDS, gateTableFor, reviewSubjectKind } from "../lib/review-subjects.ts";
import { fieldId, parseFieldId } from "../lib/teaching-revisions.ts";

const read = (file) => readFile(file, "utf8");

// ---------------------------------------------------------------------------
// The one list of reviewed things
// ---------------------------------------------------------------------------

test("teaching outlines are one of the reviewed kinds, alongside teachings, devotionals and weekly updates", () => {
  assert.deepEqual([...REVIEW_SUBJECT_KINDS], ["teaching", "devotional", "weekly_update", "outline", "handout"]);
  assert.equal(REVIEW_SUBJECTS.outline.reviewFolder, "outline-review");
  assert.equal(REVIEW_SUBJECTS.outline.adminPath("abc"), "/admin/outlines/abc");
  assert.equal(REVIEW_SUBJECTS.outline.reviewOneRpc, "review_outline_revision_change");
  assert.equal(REVIEW_SUBJECTS.outline.reviewAllRpc, "review_all_outline_revision_changes");
  assert.equal(REVIEW_SUBJECTS.outline.gateTable, "teaching_outlines");
  assert.equal(gateTableFor("outline"), "teaching_outlines");
  assert.equal(gateTableFor("teaching"), "teachings");
  assert.equal(gateTableFor("devotional"), "teaching_devotionals");
});

test("every kind except the weekly update has the Administrator's gate", () => {
  assert.deepEqual(REVIEW_SUBJECT_KINDS.filter((kind) => REVIEW_SUBJECTS[kind].gateTable !== null), ["teaching", "devotional", "outline", "handout"]);
  assert.equal(REVIEW_SUBJECTS.weekly_update.gateTable, null);
});

test("an unknown subject type falls back to a teaching, so a bad value can never pick another kind's functions", () => {
  assert.equal(reviewSubjectKind("outline"), "outline");
  assert.equal(reviewSubjectKind("nonsense"), "teaching");
  assert.equal(reviewSubjectKind(undefined), "teaching");
});

test("the existing review functions are the ones the registry names", async () => {
  const sql = (await read("supabase/migrations/20261006030000_content_revisions.sql")) + (await read("supabase/migrations/20261007020000_devotional_revisions.sql")) + (await read("supabase/migrations/20261007040000_weekly_update_revisions.sql")) + (await read("supabase/migrations/20261011030000_outline_review.sql")) + (await read("supabase/migrations/20261013000000_handout_review.sql"));
  for (const kind of REVIEW_SUBJECT_KINDS) {
    for (const name of [REVIEW_SUBJECTS[kind].reviewOneRpc, REVIEW_SUBJECTS[kind].reviewAllRpc]) {
      assert.match(sql, new RegExp(`create or replace function public\\.${name}\\(`), name);
    }
  }
});

// ---------------------------------------------------------------------------
// The email and links
// ---------------------------------------------------------------------------

test("the review email and link work for an outline", () => {
  assert.equal(reviewPath("outline", "id1"), "/admin/cm/outline-review/id1");
  const email = buildReviewReadyEmail({ kind: "outline", title: "Walking in the Light", reviewUrl: "https://example.com/admin/cm/outline-review/id1" });
  assert.match(email.html, /sent you a teaching outline to review/);
  assert.match(email.html, /Open it for review/);
  assert.equal(email.subject, "Ready for your review: Walking in the Light");
});

test("the other kinds still link where they always did", () => {
  assert.equal(reviewPath("teaching", "x"), "/admin/cm/teaching-review/x");
  assert.equal(reviewPath("devotional", "x"), "/admin/cm/devotional-review/x");
  assert.equal(reviewPath("weekly_update", "x"), "/admin/cm/weekly-update-review/x");
});

// ---------------------------------------------------------------------------
// Field shaping and comparison
// ---------------------------------------------------------------------------

test("fields from the database become review fields for an outline", () => {
  const fields = outlineEditableFields([
    { field_key: "block_2", label: "Paragraph 2", context: "Lesson at a Glance", current_value: "**Hi** there", max_length: 12000, multiline: true, field_rows: 3, formatted: true },
  ]);
  assert.equal(fields.length, 1);
  assert.equal(fields[0].targetKind, "outline");
  assert.equal(fields[0].targetId, null);
  assert.equal(fields[0].id, "outline:-:block_2");
  assert.equal(fields[0].current, "**Hi** there");
  assert.deepEqual(outlineEditableFields(null), []);
});

test("a field id for an outline round-trips, including list items and table cells", () => {
  for (const key of ["title", "subtitle", "block_4", "block_6_item_2", "block_7_cell_1_2"]) {
    assert.deepEqual(parseFieldId(fieldId("outline", null, key)), { targetKind: "outline", targetId: null, fieldKey: key });
  }
  assert.equal(parseFieldId("bogus:-:block_1"), null);
});

const inl = (text, extra = {}) => ({ text, ...extra });
const blocks = (overrides = {}) => [
  { type: "heading", level: 1, inlines: [inl("Lesson")] },
  { type: "paragraph", inlines: [inl("Central truth: ", { bold: true }), inl("God is near.")] },
  { type: "list", items: [{ level: 0, ordered: false, inlines: [inl(overrides.first ?? "First")] }, { level: 0, ordered: false, inlines: [inl("Second")] }] },
  { type: "table", rows: [[[inl("A")], [inl(overrides.cell ?? "B")]]] },
];

test("outline wording is keyed exactly like the review fields", () => {
  const texts = outlineTexts(blocks());
  assert.deepEqual([...texts.keys()], ["block_1", "block_2", "block_3_item_1", "block_3_item_2", "block_4_cell_1_1", "block_4_cell_1_2"]);
  assert.equal(texts.get("block_2"), "Central truth: God is near.");
});

test("the comparison with the upload reports only places whose wording differs", () => {
  assert.equal(compareOutlines(blocks(), blocks()).differences.length, 0);
  const { differences, sameLength } = compareOutlines(blocks(), blocks({ first: "First point", cell: "B2" }));
  assert.equal(sameLength, true);
  assert.deepEqual(differences, [
    { key: "block_3_item_1", original: "First", current: "First point" },
    { key: "block_4_cell_1_2", original: "B", current: "B2" },
  ]);
  // Formatting alone is not a change of wording.
  const bolded = blocks();
  bolded[0].inlines = [inl("Lesson", { bold: true })];
  assert.equal(compareOutlines(blocks(), bolded).differences.length, 0);
});

test("added or removed blocks are reported rather than hidden", () => {
  const longer = [...blocks(), { type: "paragraph", inlines: [inl("Extra")] }];
  const { differences, sameLength } = compareOutlines(blocks(), longer);
  assert.equal(sameLength, false);
  assert.deepEqual(differences, [{ key: "block_5", original: "", current: "Extra" }]);
});

// ---------------------------------------------------------------------------
// The gate and the Administrator's side
// ---------------------------------------------------------------------------

test("an outline is sent and taken back through the same two actions as teachings and devotionals", async () => {
  const actions = await read("app/admin/review-gate-actions.ts");
  assert.match(actions, /REVIEW_SUBJECTS\[kind\]\.adminPath\(id\)/);
  assert.match(actions, /gateTableFor\(kind\)/);
  assert.match(actions, /requireAdmin\(\)/);
  assert.doesNotMatch(actions, /requireContentManager/);

  const page = await read("app/admin/outlines/[id]/page.tsx");
  assert.match(page, /isDraft \? \(\s*<ReviewGateSection\s+noun="teaching outline"/);
  assert.match(page, /sendForReview\.bind\(null, "outline"/);
  assert.match(page, /takeBackFromReview\.bind\(null, "outline"/);
  assert.match(page, /ReviewGateMessage/);
});

test("the outlines list says whether each draft has been sent to the Content Managers", async () => {
  const manager = await read("app/admin/outlines/outline-manager.tsx");
  assert.match(manager, /outline\.sentForReviewAt \? "With Content Managers" : "Not sent for review"/);
  const page = await read("app/admin/outlines/page.tsx");
  assert.match(page, /sent_for_review_at/);
});

test("the revisions screens use the registry, so outlines appear with their own tag and link", async () => {
  const list = await read("app/admin/teaching-revisions/page.tsx");
  assert.match(list, /\.in\("subject_type", \[\.\.\.REVIEW_SUBJECT_KINDS\]\)/);
  assert.match(list, /REVIEW_SUBJECTS\[reviewSubjectKind\(type\)\]\.badge/);
  const detail = await read("app/admin/teaching-revisions/[revisionId]/page.tsx");
  assert.match(detail, /outline_review_fields/);
  assert.match(detail, /REVIEW_SUBJECTS\.outline\.adminPath\(outlineId\)/);
  const actions = await read("app/admin/teaching-revisions/actions.ts");
  assert.match(actions, /REVIEW_SUBJECTS\[subject\]\.reviewOneRpc/);
  assert.match(actions, /REVIEW_SUBJECTS\[subject\]\.reviewAllRpc/);
  assert.match(actions, /reviewSubjectKind\(data\?\.subject_type\)/);
});

test("the Administrator's text editor is one shared component used by weekly updates and outlines", async () => {
  const editor = await read("app/admin/text-editor.tsx");
  assert.match(editor, /export function AdminTextEditor/);
  assert.match(await read("app/admin/weekly-updates/[id]/edit-text/page.tsx"), /from "@\/app\/admin\/text-editor"/);
  const page = await read("app/admin/outlines/[id]/edit-text/page.tsx");
  assert.match(page, /from "@\/app\/admin\/text-editor"/);
  assert.match(page, /\.eq\("status", "draft"\)/);
  assert.match(page, /Changed since the uploaded Word document/);
  const actions = await read("app/admin/outlines/[id]/edit-text/actions.ts");
  assert.match(actions, /rpc\("admin_edit_outline_text"/);
  assert.match(actions, /normalizeRevisionText\(proposed\) === normalizeRevisionText\(base\)\) continue/);
  assert.equal(/status: "published"|publish/.test(actions), false, "saving text never publishes");
});

// ---------------------------------------------------------------------------
// The Content Manager's side
// ---------------------------------------------------------------------------

test("a Content Manager's outline pages only read what the database lets through, and only call the review functions", async () => {
  const list = await read("app/admin/cm/outline-review/page.tsx");
  assert.match(list, /requireContentManager\(\)/);
  assert.match(list, /Nothing has been sent to you for review right now/);
  const edit = await read("app/admin/cm/outline-review/[id]/page.tsx");
  assert.match(edit, /rpc\("outline_review_fields"/);
  assert.match(edit, /RecallRevisionButton subject="outline"/);
  assert.match(edit, /subject="teaching outline"/);
  const actions = await read("app/admin/cm/outline-review/actions.ts");
  assert.match(actions, /requireContentManager\(\)/);
  for (const name of ["create_outline_revision", "save_outline_revision_draft", "submit_outline_revision", "discard_teaching_revision"]) {
    assert.match(actions, new RegExp(`rpc\\("${name}"`), name);
  }
  assert.doesNotMatch(actions, /\.from\("teaching_outlines"\)|\.update\(|\.insert\(/, "nothing here writes to the outline");
});

test("the Content Manager dashboard offers the outline review instead of the old upload tool", async () => {
  const cm = await read("app/admin/cm/page.tsx");
  assert.match(cm, /supabase\.from\("teaching_outlines"\)\.select\([^)]*\)\.eq\("status", "draft"\)\.not\("sent_for_review_at", "is", null\)/);
  assert.doesNotMatch(cm, /href: "\/admin\/outlines"/);
});

// ---------------------------------------------------------------------------
// The migration
// ---------------------------------------------------------------------------

test("the migration adds the gate, the outline revision kind, and keeps every write behind a checked function", async () => {
  const sql = await read("supabase/migrations/20261011030000_outline_review.sql");
  assert.match(sql, /alter table public\.teaching_outlines add column if not exists sent_for_review_at timestamptz/);
  assert.match(sql, /sent_for_review_at is null or status = 'draft'/);
  assert.match(sql, /create trigger teaching_outlines_clear_review_gate/);
  assert.match(sql, /using \(public\.is_content_manager_or_admin\(\) and status = 'draft' and sent_for_review_at is not null\)/);
  assert.match(sql, /subject_type in \('teaching', 'devotional', 'weekly_update', 'outline'\)/);
  assert.match(sql, /elsif p_subject_type = 'outline' then\s+return exists \(select 1 from public\.teaching_outlines where id = p_outline_id and status = 'draft' and sent_for_review_at is not null\)/);
  assert.match(sql, /if public\.is_authenticated_admin\(\) then\s+return true;/, "Administrators are never blocked");
  assert.match(sql, /review_is_open\(v_rev\.subject_type, v_rev\.teaching_id, v_rev\.devotional_id, v_rev\.weekly_update_id, v_rev\.outline_id\)/);
  assert.match(sql, /r\.outline_id is not distinct from v_rev\.outline_id/, "taking back respects the outline");
  assert.match(sql, /create trigger teaching_outlines_close_revisions_on_publish/);
  for (const name of ["create_outline_revision(uuid)", "save_outline_revision_draft(uuid, jsonb)", "submit_outline_revision(uuid)", "review_outline_revision_change(uuid, text, text, boolean)", "review_all_outline_revision_changes(uuid, text)", "admin_edit_outline_text(uuid, jsonb)"]) {
    assert.match(sql, new RegExp(`revoke all on function public\\.${name.replace(/[()]/g, "\\$&")} from public, anon`), `${name} is not open to the public`);
    assert.match(sql, new RegExp(`grant execute on function public\\.${name.replace(/[()]/g, "\\$&")} to authenticated`), name);
  }
});

test("the migration only writes known places and only http(s) links", async () => {
  const sql = await read("supabase/migrations/20261011030000_outline_review.sql");
  assert.match(sql, /\(https\?:\/\/\[\^\\s\(\)\]\+\)/, "a link must be http or https");
  assert.match(sql, /v_href !~ '\^https\?:\/\/\[\^\\s\(\)\]\+\$'/);
  assert.match(sql, /regexp_match\(p_field, '\^block_\(\[0-9\]\+\)/, "field names are parsed, never used as SQL");
  assert.match(sql, /public\.revision_outline_markup_to_inlines\(v_markup\) is distinct from/, "text is offered only if it reads back exactly");
});

// ---------------------------------------------------------------------------
// Adding and removing paragraphs (outlines only; weekly updates stay wording-only)
// ---------------------------------------------------------------------------

test("only the outline editor offers Add below and Delete, and only to the Administrator", async () => {
  const editor = await read("app/admin/text-editor.tsx");
  assert.match(editor, /Add below/);
  assert.match(editor, /disabled=\{changedCount > 0 \|\| structurePending \|\| pending\}/, "turned off while there are unsaved edits");
  const outlinePage = await read("app/admin/outlines/[id]/edit-text/page.tsx");
  assert.match(outlinePage, /structureAction=\{changeOutlineStructure\.bind\(null, id\)\}/);
  assert.doesNotMatch(outlinePage, /allows:|run:/, "no inline function is passed from the page to the client editor");
  assert.doesNotMatch(await read("app/admin/weekly-updates/[id]/edit-text/page.tsx"), /structureAction=/);
  const actions = await read("app/admin/outlines/[id]/edit-text/actions.ts");
  assert.match(actions, /export async function changeOutlineStructure[\s\S]*?await requireAdmin\(\)[\s\S]*?rpc\("admin_outline_structure"/);
  assert.match(actions, /To remove a paragraph, save your other edits and use its Delete button/);
});

test("the structure migration is Administrator-only, draft-only, and refuses while a proposal is open", async () => {
  const sql = await read("supabase/migrations/20261011040000_outline_add_remove_paragraphs.sql");
  assert.match(sql, /is_authenticated_admin\(\)/);
  assert.match(sql, /status = 'draft' for update/);
  assert.match(sql, /status in \('draft', 'submitted'\)/);
  assert.match(sql, /revoke all on function public\.admin_outline_structure\(uuid, text, text\) from public, anon/);
  assert.match(sql, /grant execute on function public\.admin_outline_structure\(uuid, text, text\) to authenticated/);
});
