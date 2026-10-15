import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { devotionalChoices } from "../lib/devotional-choices.ts";
import { devotionalDate } from "../lib/devotional-date.ts";
import { validateOptionalGatheringDate } from "../lib/teaching-date.ts";

const read = (file) => readFile(file, "utf8");

test("a devotional's own date wins; with none it takes the latest date of its teachings; with neither it has none", () => {
  assert.equal(devotionalDate("2026-10-10", ["2026-09-01"]), "2026-10-10");
  assert.equal(devotionalDate(null, ["2026-09-01", null, "2026-09-20"]), "2026-09-20");
  assert.equal(devotionalDate("", []), null);
  assert.equal(devotionalDate(undefined, [null]), null);
  assert.equal(devotionalDate("2026-10-10T00:00:00Z", []), "2026-10-10");
});

test("a created devotional with no teaching still has a date in the picker once one is entered", () => {
  const choices = devotionalChoices({
    devotionals: [
      { id: "d1", title: "Not yet assigned", status: "draft", language: "en", legacyTeachingId: null, gatheringDate: "2026-10-10" },
      { id: "d2", title: "No date anywhere", status: "draft", language: "en", legacyTeachingId: null, gatheringDate: null },
      { id: "d3", title: "Assigned, no own date", status: "published", language: "en", legacyTeachingId: null, gatheringDate: null },
    ],
    assignments: [{ devotional_id: "d3", teaching_id: "t1" }],
    teachingDates: [{ id: "t1", gathering_date: "2026-09-20" }],
    teachingLanguage: "en",
    currentDevotionalId: null,
  });
  assert.deepEqual(choices.map((choice) => [choice.title, choice.dateLabel]), [
    ["Not yet assigned", "Oct 10, 2026"],
    ["Assigned, no own date", "Sep 20, 2026"],
    ["No date anywhere", "No gathering date"],
  ]);
});

test("a gathering date from a form is optional but must be a real date", () => {
  assert.deepEqual(validateOptionalGatheringDate(""), { value: null });
  assert.deepEqual(validateOptionalGatheringDate("2026-10-10"), { value: "2026-10-10" });
  assert.ok(validateOptionalGatheringDate("2026-02-30").error);
});

test("both devotional pages let the date be entered under Series Information", async () => {
  const form = await read("app/admin/teachings/[id]/devotional/devotional-editor.tsx");
  assert.match(form, /name="gatheringDate" type="date"/);
  assert.match(form, /gatheringDate: devotional\.gathering_date \?\? ""/);
  const actions = await read("app/admin/teachings/devotional-actions.ts");
  const series = actions.slice(actions.indexOf("export async function updateDevotionalSeries"), actions.indexOf("export async function updateDevotionalDay"));
  assert.match(series, /gathering_date: date\.value \?\? null/);
  const standalone = actions.slice(actions.indexOf("export async function updateStandaloneDevotionalSeries"), actions.indexOf("export async function updateStandaloneDevotionalDay"));
  assert.match(standalone, /gathering_date: date\.value \?\? null/);
});

test("a devotional is given a date when it is created from a teaching or a file, and when it is assigned without one", async () => {
  const actions = await read("app/admin/teachings/devotional-actions.ts");
  assert.match(actions, /gathering_date: teaching\.gathering_date \?\? null, status: "draft"/);
  assert.match(actions, /gatheringDate: suggestHandoutFromFileName\(fileName\)\.date/);
  const assign = actions.slice(actions.indexOf("export async function assignExistingDevotional"), actions.indexOf("export async function removeDevotionalAssignment"));
  assert.match(assign, /if \(!devotional\.gathering_date && teaching\.gathering_date\)/, "a date already entered is kept");
});

test("the lists and pickers use the same rule, and the devotional's own page shows its date", async () => {
  assert.match(await read("app/admin/devotionals/page.tsx"), /gatheringDate\(devotional\.ownDate, devotional\.associatedTeachings\)/);
  assert.match(await read("lib/translation-options.ts"), /devotionalDate\(row\.gathering_date/);
  assert.match(await read("lib/devotional-choices.ts"), /devotionalDate\(devotional\.gatheringDate/);
  assert.match(await read("app/admin/devotionals/[id]/page.tsx"), /No gathering date yet\. Enter one under Series Information\./);
});

test("the migration adds the date and fills it from the assigned teaching", async () => {
  const sql = await read("supabase/migrations/20261015040000_devotional_gathering_date.sql");
  assert.match(sql, /add column if not exists gathering_date date/);
  assert.match(sql, /teaching_devotional_assignments assignment/);
  assert.match(sql, /devotional\.teaching_id = teaching\.id/);
});
