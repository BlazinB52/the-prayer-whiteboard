import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (file) => readFile(file, "utf8");

test("a new weekly update needs a gathering date; an old one can be saved without", async () => {
  const actions = await read("app/admin/weekly-updates/actions.ts");
  assert.match(actions, /Choose the gathering date this weekly update is for\./);
  assert.match(actions, /gathering_date: gathering\.value,/);
  assert.match(actions, /if \(gathering\.value\) update\.gathering_date = gathering\.value;/);
  const editor = await read("app/admin/weekly-updates/weekly-update-editor.tsx");
  assert.match(editor, /name="gatheringDate" type="date"/);
  assert.match(editor, /required=\{!weeklyUpdateId\}/);
});

test("recording a letter that already went out sends nothing and shows nothing", async () => {
  const actions = await read("app/admin/weekly-updates/actions.ts");
  const start = actions.indexOf("export async function recordSentWeeklyUpdate");
  const body = actions.slice(start);
  assert.ok(start > 0);
  assert.match(body, /status: "archived"/);
  assert.match(body, /is_current: false/);
  assert.match(body, /recorded_sent_on: sentOn/);
  assert.doesNotMatch(body, /publish_weekly_update|notifyContentManagers|status: "published"/, "recording never publishes or emails");
  assert.match(body, /There is already a/, "a gathering and language is not recorded twice");
  assert.match(body, /requireAdmin\(\)/);
});

test("the migration adds the date, the translation link and the recorded-sent mark, and keeps a recorded letter out of sight", async () => {
  const sql = await read("supabase/migrations/20261016000000_weekly_update_dates_and_translation.sql");
  assert.match(sql, /add column if not exists gathering_date date/);
  assert.match(sql, /translation_of uuid references public\.weekly_updates\(id\) on delete set null/);
  assert.match(sql, /recorded_sent_on date/);
  assert.match(sql, /recorded_sent_on is null or \(status = 'archived' and is_current = false\)/);
});

test("the weekly update list is two lists by gathering date, and the report matches a letter to its teaching by date", async () => {
  const page = await read("app/admin/weekly-updates/page.tsx");
  assert.match(page, /heading: "English"/);
  assert.match(page, /heading: "Español"/);
  assert.match(page, /RecordSentForm/);
  const report = await read("app/admin/cm/reports/title-collections/page.tsx");
  assert.match(report, /teaching\.gathering_date === row\.gathering_date/);
});
