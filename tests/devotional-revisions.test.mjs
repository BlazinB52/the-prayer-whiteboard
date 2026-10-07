import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildDevotionalEditableFields } from "../lib/devotional-revisions.ts";
import { fieldId, parseFieldId } from "../lib/teaching-revisions.ts";

const devotional = { id: "d1", title: "Walking in the Light", introduction: "Intro." };
const days = [
  { id: "day-2", day_number: 2, title: "Light", anchor_scriptures: ["Ps 27:1"], devotional_reading: "Two.", confession: null, journal_prompt: null, prayer_activation: null },
  { id: "day-1", day_number: 1, title: "Camp", anchor_scriptures: ["Eph 5:11", "John 3:16"], devotional_reading: "One.", confession: "Conf.", journal_prompt: "Prompt.", prayer_activation: "Act." },
];

test("the editable fields cover the series and each day in reading order, and nothing else", () => {
  const fields = buildDevotionalEditableFields(devotional, days);
  assert.deepEqual(fields.slice(0, 2).map((field) => field.fieldKey), ["title", "introduction"]);
  assert.equal(fields[0].targetKind, "devotional");
  const dayFields = fields.slice(2);
  assert.equal(dayFields.length, 12, "six fields for each of the two days");
  assert.deepEqual(dayFields.slice(0, 6).map((field) => field.fieldKey), ["title", "anchor_scriptures", "devotional_reading", "confession", "journal_prompt", "prayer_activation"]);
  assert.equal(dayFields[0].context, "Day 1 — Camp", "days are sorted by day number");
  const carried = buildDevotionalEditableFields(devotional, [{ ...days[1], title: "Day 1: Choosing Your Camp" }, { ...days[0], title: "Día 2: Luz" }, { ...days[0], id: "day-3", day_number: 3, title: "" }]);
  assert.deepEqual([...new Set(carried.slice(2).map((field) => field.context))], ["Day 1: Choosing Your Camp", "Día 2: Luz", "Day 3"], "the number is not repeated when the title already carries it");
  assert.equal(dayFields[1].current, "Eph 5:11\nJohn 3:16", "anchor scriptures are one per line");
  assert.equal(dayFields[9].current, "", "an empty field starts empty");
  assert.ok(fields.every((field) => ["devotional", "day"].includes(field.targetKind)));
});

test("field ids round-trip for the devotional and day targets", () => {
  assert.deepEqual(parseFieldId(fieldId("devotional", null, "title")), { targetKind: "devotional", targetId: null, fieldKey: "title" });
  assert.deepEqual(parseFieldId(fieldId("day", "day-1", "anchor_scriptures")), { targetKind: "day", targetId: "day-1", fieldKey: "anchor_scriptures" });
  assert.equal(parseFieldId("slug:-:x"), null);
});

test("co-editor devotional actions only call the review functions and never write or read tables directly", async () => {
  const source = await readFile("app/admin/cm/devotional-review/actions.ts", "utf8");
  assert.match(source, /requireContentManager\(\)/);
  assert.doesNotMatch(source, /requireAdmin|service-role|createServiceRoleClient/);
  assert.doesNotMatch(source, /\.from\(/);
  const calls = [...source.matchAll(/\.rpc\("([a-z_]+)"/g)].map((match) => match[1]);
  assert.deepEqual([...new Set(calls)].sort(), ["create_devotional_revision", "discard_teaching_revision", "save_devotional_revision_draft", "submit_devotional_revision"]);
  for (const forbidden of ["review_devotional_revision_change", "review_all_devotional_revision_changes", "cancel_teaching_revision", "purge_revision_history"]) {
    assert.equal(source.includes(forbidden), false, `${forbidden} is Administrator-only`);
  }
});

test("the Content Management page offers Devotional - Review, and it lists only draft devotionals", async () => {
  const cm = await readFile("app/admin/cm/page.tsx", "utf8");
  assert.match(cm, /title: "Devotional - Review"/);
  assert.match(cm, /href: "\/admin\/cm\/devotional-review"/);
  const list = await readFile("app/admin/cm/devotional-review/page.tsx", "utf8");
  assert.match(list, /\.eq\("status", "draft"\)/);
  const edit = await readFile("app/admin/cm/devotional-review/[id]/page.tsx", "utf8");
  assert.match(edit, /\.eq\("status", "draft"\)/);
});

test("the devotional review migration keeps decisions Administrator-only and the tables read-only", async () => {
  const sql = await readFile("supabase/migrations/20261007020000_devotional_revisions.sql", "utf8");
  for (const name of ["review_devotional_revision_change", "review_all_devotional_revision_changes"]) {
    const body = sql.match(new RegExp(`create or replace function public\\.${name}[\\s\\S]*?\\n\\$\\$;`))?.[0] ?? "";
    assert.notEqual(body, "", `${name} must exist`);
    assert.match(body, /is_authenticated_admin\(\)/);
    assert.match(body, /security definer/);
  }
  for (const name of ["create_devotional_revision", "save_devotional_revision_draft", "submit_devotional_revision"]) {
    const body = sql.match(new RegExp(`create or replace function public\\.${name}[\\s\\S]*?\\n\\$\\$;`))?.[0] ?? "";
    assert.match(body, /is_content_manager_or_admin\(\)/, `${name} checks the caller`);
  }
  assert.doesNotMatch(sql, /grant (insert|update|delete|all)[^;]*to authenticated/i);
  assert.match(sql, /status = 'draft'/);
});

test("the Administrator pages show devotional revisions and send each decision to the matching functions", async () => {
  const actions = await readFile("app/admin/teaching-revisions/actions.ts", "utf8");
  assert.match(actions, /review_devotional_revision_change/);
  assert.match(actions, /review_all_devotional_revision_changes/);
  const list = await readFile("app/admin/teaching-revisions/page.tsx", "utf8");
  assert.match(list, /\.in\("subject_type", \["teaching", "devotional"\]\)/);
  const detail = await readFile("app/admin/teaching-revisions/[revisionId]/page.tsx", "utf8");
  assert.match(detail, /buildDevotionalEditableFields/);
  const editPage = await readFile("app/admin/devotionals/[id]/page.tsx", "utf8");
  assert.match(editPage, /co-editor \{pendingRevisionCount\}|\{pendingRevisionCount\} co-editor/);
});
