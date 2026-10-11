import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile("supabase/migrations/20261011000000_keep_revision_wording_until_cleared.sql", "utf8");
const listPage = await readFile("app/admin/teaching-revisions/page.tsx", "utf8");
const detailPage = await readFile("app/admin/teaching-revisions/[revisionId]/page.tsx", "utf8");

function body(name) {
  const start = migration.indexOf(`function public.${name}`);
  const end = migration.indexOf("$$;", migration.indexOf("as $$", start));
  return migration.slice(start, end);
}

test("finishing a revision no longer deletes what was accepted and rejected", () => {
  const finish = body("revision_finish_if_done");
  assert.match(finish, /status = 'completed'/);
  assert.doesNotMatch(finish, /delete from/);
  assert.doesNotMatch(finish, /purged_at/);
});

test("publishing and closing keep submitted revisions' wording, and only discard unsubmitted drafts", () => {
  for (const name of ["close_teaching_revisions_on_publish", "close_devotional_revisions_on_publish", "close_weekly_update_revisions_on_publish"]) {
    const fn = body(name);
    // The only delete is for a revision still in 'draft' (never submitted).
    const deletes = fn.match(/delete from public\.content_revision_changes[\s\S]*?;/g) ?? [];
    assert.equal(deletes.length, 1, `${name} has exactly one delete`);
    assert.match(deletes[0], /r\.status = 'draft'/);
    assert.match(fn, /purged_at = case when r\.status = 'draft' then now\(\) else r\.purged_at end/);
  }
  const cancel = body("cancel_teaching_revision");
  assert.match(cancel, /if v_rev\.status = 'draft' then\s+delete from public\.content_revision_changes/);
});

test("clearing the history still removes everything, including the kept wording", async () => {
  const original = await readFile("supabase/migrations/20261006030000_content_revisions.sql", "utf8");
  const purge = original.slice(original.indexOf("function public.purge_revision_history"));
  assert.match(purge, /delete from public\.content_revisions/);
  // The changes go with their revision, so nothing is left behind after Clear.
  assert.match(original, /revision_id uuid not null references public\.content_revisions\(id\) on delete cascade/);
});

test("the history list scrolls, and every record with kept wording opens", () => {
  assert.match(listPage, /max-h-\[26rem\][^"]*overflow-y-auto/);
  assert.match(listPage, /href=\{`\/admin\/teaching-revisions\/\$\{revision\.id\}`\}[^>]*revision\.purged_at/);
  // Older records that only have counts are shown as such and cannot be opened.
  assert.match(listPage, /Counts only/);
  assert.match(listPage, /purged_at/);
});

test("a finished record shows each change with its decision, and is read-only", () => {
  assert.match(detailPage, /const showChanges = open \|\| !revision\.purged_at/);
  assert.match(detailPage, /!open && showChanges && changes\.length/);
  assert.match(detailPage, /This is a record\. Nothing here can be changed\./);
  const record = detailPage.slice(detailPage.indexOf("This is a record"), detailPage.indexOf("{open ? ("));
  assert.doesNotMatch(record, /<form|reviewChange|reviewAllChanges/);
  assert.match(record, /change\.change_status === "pending" \? "not decided" : change\.change_status/);
});
