import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TrackedText, describeDiff, diffText } from "../lib/tracked-text.ts";
import {
  buildEditableFields,
  fieldId,
  friendlyRevisionError,
  isStale,
  normalizeRevisionText,
  parseFieldId,
} from "../lib/teaching-revisions.ts";

const teaching = {
  id: "t1", title: "Title", central_theme: "Theme", introduction: "Intro", summary: "Summary",
  teaser_1_heading: "H1", teaser_1_text: "T1", teaser_2_heading: null, teaser_2_text: null,
};
const categories = [{ id: "c2", title: "Second", sort_order: 2 }, { id: "c1", title: "First", sort_order: 1 }];
const sections = [
  { id: "s1", category_id: "c1", title: "Para", sort_order: 1, content: { format: "paragraph", text: "Body", showTitle: true } },
  { id: "s2", category_id: "c1", title: "Take", sort_order: 2, content: { format: "takeaway", text: "Key point" } },
  { id: "s3", category_id: "c2", title: "List", sort_order: 1, content: { format: "bullets", introduction: "Lead", bullets: ["a", "b"], conclusion: "End" } },
  { id: "s4", category_id: "c2", title: "Verse", sort_order: 2, content: { format: "scripture", reference: "John 3:16", translation: "NIV", quotation: "For God so loved", callout: { enabled: true } } },
];

test("a one-word edit shows one word removed and one added, not a replaced paragraph", () => {
  const diff = describeDiff("The Lord is faithful.", "The Lord remains faithful.");
  assert.deepEqual(diff.deleted, ["is"]);
  assert.deepEqual(diff.inserted, ["remains"]);
  const segments = diffText("The Lord is faithful.", "The Lord remains faithful.");
  assert.equal(segments.filter((segment) => segment.type === "same").map((segment) => segment.text).join(""), "The Lord  faithful.");
});

test("deleting words is a proposal shown as deleted text, and adding words is shown as inserted text", () => {
  assert.deepEqual(describeDiff("one two three", "one three"), { inserted: [], deleted: ["two "] });
  assert.deepEqual(describeDiff("one three", "one two three"), { inserted: ["two "], deleted: [] });
  assert.deepEqual(describeDiff("same", "same"), { inserted: [], deleted: [] });
});

test("punctuation, paragraph breaks and formatting markers are preserved in the comparison", () => {
  const original = "First paragraph, with **bold** and *italic*.\n\nSecond paragraph: [a link](https://example.com).";
  const proposed = "First paragraph, with **bolder** and *italic*.\n\nSecond paragraph: [a link](https://example.com)!";
  const rebuiltProposed = diffText(original, proposed).filter((segment) => segment.type !== "del").map((segment) => segment.text).join("");
  const rebuiltOriginal = diffText(original, proposed).filter((segment) => segment.type !== "ins").map((segment) => segment.text).join("");
  assert.equal(rebuiltProposed, proposed, "reading the inserted and unchanged parts gives back the proposal exactly");
  assert.equal(rebuiltOriginal, original, "reading the deleted and unchanged parts gives back the original exactly");
  assert.match(rebuiltProposed, /\*\*bolder\*\*/);
  assert.match(rebuiltProposed, /\[a link\]\(https:\/\/example\.com\)/);
  assert.match(rebuiltProposed, /\n\n/);
});

test("the comparison escapes unsafe HTML instead of running it", () => {
  const html = renderToStaticMarkup(createElement(TrackedText, {
    original: "Safe text",
    proposed: 'Safe <script>alert("x")</script> <img src=x onerror=alert(1)> text',
  }));
  assert.doesNotMatch(html, /<script/i);
  assert.doesNotMatch(html, /<img/i);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /&lt;img/);
  assert.match(html, /<ins[^>]*>/, "added words are marked as insertions");
});

test("deleted text is red and struck through, inserted text is underlined in a review color", () => {
  const html = renderToStaticMarkup(createElement(TrackedText, { original: "a b", proposed: "a c" }));
  assert.match(html, /<del[^>]*line-through[^>]*>b<\/del>/);
  assert.match(html, /<ins[^>]*underline[^>]*>c<\/ins>/);
  assert.match(html, /#b3261e/, "deleted wording is red");
});

test("no review page renders text as HTML", async () => {
  for (const file of [
    "lib/tracked-text.ts",
    "app/admin/teaching-revisions/page.tsx",
    "app/admin/teaching-revisions/[revisionId]/page.tsx",
    "app/admin/cm/teaching-review/page.tsx",
    "app/admin/cm/teaching-review/[id]/page.tsx",
    "app/admin/cm/teaching-review/[id]/review-edit-form.tsx",
  ]) {
    assert.doesNotMatch(await readFile(file, "utf8"), /dangerouslySetInnerHTML|innerHTML/, `${file} must not inject HTML`);
  }
});

test("the editable fields cover the teaching, categories and each section format, in reading order", () => {
  const fields = buildEditableFields(teaching, categories, sections);
  const ids = fields.map((field) => field.id);
  assert.deepEqual(ids.slice(0, 8), [
    "teaching:-:title", "teaching:-:central_theme", "teaching:-:introduction", "teaching:-:summary",
    "teaching:-:teaser_1_heading", "teaching:-:teaser_1_text", "teaching:-:teaser_2_heading", "teaching:-:teaser_2_text",
  ]);
  assert.deepEqual(ids.slice(8), [
    "category:c1:title", "section:s1:title", "section:s1:text", "section:s2:title", "section:s2:text",
    "category:c2:title", "section:s3:title", "section:s3:introduction", "section:s3:bullets", "section:s3:conclusion",
    "section:s4:title", "section:s4:introduction", "section:s4:reference", "section:s4:quotation",
  ]);
  assert.equal(fields.find((field) => field.id === "section:s3:bullets").current, "a\nb");
  assert.equal(fields.find((field) => field.id === "teaching:-:teaser_2_text").current, "");
});

test("Administrator-only things are never offered to a co-editor", () => {
  const keys = buildEditableFields(teaching, categories, sections).map((field) => field.fieldKey);
  for (const adminOnly of ["translation", "slug", "status", "gathering_date", "teaching_type", "language", "format", "callout", "showTitle", "sort_order", "chalkboard"]) {
    assert.equal(keys.includes(adminOnly), false, `${adminOnly} must stay Administrator-only`);
  }
});

test("field ids round-trip, and anything malformed is rejected", () => {
  assert.equal(fieldId("section", "abc", "text"), "section:abc:text");
  assert.deepEqual(parseFieldId("section:abc:text"), { targetKind: "section", targetId: "abc", fieldKey: "text" });
  assert.deepEqual(parseFieldId("teaching:-:title"), { targetKind: "teaching", targetId: null, fieldKey: "title" });
  assert.equal(parseFieldId("evil:abc:text"), null);
  assert.equal(parseFieldId("section:abc"), null);
  assert.equal(parseFieldId(""), null);
});

test("text is normalised the same way the database does it", () => {
  assert.equal(normalizeRevisionText("  a\r\nb\r  "), "a\nb");
  assert.equal(normalizeRevisionText(null), "");
});

test("a proposal is stale when the approved wording moved after it was written", () => {
  assert.equal(isStale({ original_value: "Same" }, "Same"), false);
  assert.equal(isStale({ original_value: "Same" }, "  Same\r\n"), false);
  assert.equal(isStale({ original_value: "Old" }, "Changed by the Administrator"), true);
  assert.equal(isStale({ original_value: "Old" }, null), true, "a part of the teaching that was removed is stale");
});

test("database errors are turned into plain words", () => {
  assert.match(friendlyRevisionError("conflict: teaching:title changed after you opened this page. Reload to see the current wording."), /nothing was saved/);
  assert.equal(friendlyRevisionError("stale: This text changed after the proposal was made."), "This text changed after the proposal was made.");
  assert.equal(friendlyRevisionError(null), "Something went wrong. Please try again.");
});

test("co-editor actions only call the proposal functions, never the teaching tables or the decision functions", async () => {
  const source = await readFile("app/admin/cm/teaching-review/actions.ts", "utf8");
  assert.match(source, /requireContentManager\(\)/);
  assert.doesNotMatch(source, /requireAdmin/);
  assert.doesNotMatch(source, /service-role|createServiceRoleClient/);
  assert.doesNotMatch(source, /\.from\(/, "co-editor actions make no direct table access");
  const calls = [...source.matchAll(/\.rpc\("([a-z_]+)"/g)].map((match) => match[1]).sort();
  assert.deepEqual([...new Set(calls)], ["create_teaching_revision", "discard_teaching_revision", "save_teaching_revision_draft", "submit_teaching_revision"]);
  for (const forbidden of ["review_teaching_revision_change", "review_all_teaching_revision_changes", "cancel_teaching_revision", "purge_revision_history"]) {
    assert.equal(source.includes(forbidden), false, `${forbidden} is Administrator-only`);
  }
});

test("Administrator actions require an Administrator and call the decision functions", async () => {
  const source = await readFile("app/admin/teaching-revisions/actions.ts", "utf8");
  assert.equal((source.match(/await requireAdmin\(\)/g) ?? []).length, 5);
  assert.doesNotMatch(source, /service-role|createServiceRoleClient/);
  assert.deepEqual([...source.matchAll(/\.from\("([a-z_]+)"\)/g)].map((match) => match[1]), ["content_revisions"], "the only table access reads which kind of revision this is");
  for (const name of ["review_teaching_revision_change", "review_all_teaching_revision_changes", "cancel_teaching_revision", "purge_revision_history", "review_devotional_revision_change", "review_all_devotional_revision_changes", "mark_revision_opened"]) {
    assert.match(source, new RegExp(name));
  }
});

test("only a change still waiting for a decision can show a stale warning", async () => {
  const page = await readFile("app/admin/teaching-revisions/[revisionId]/page.tsx", "utf8");
  assert.match(page, /const stale = revision\.status === "submitted" && !decided && isStale\(change, info\.current\)/);
});

test("each page uses the right sign-in check", async () => {
  for (const file of ["app/admin/teaching-revisions/page.tsx", "app/admin/teaching-revisions/[revisionId]/page.tsx"]) {
    assert.match(await readFile(file, "utf8"), /requireAdmin\(\)/, `${file} is Administrator-only`);
  }
  for (const file of ["app/admin/cm/teaching-review/page.tsx", "app/admin/cm/teaching-review/[id]/page.tsx"]) {
    assert.match(await readFile(file, "utf8"), /requireContentManager\(\)/, `${file} is for co-editors`);
  }
});

test("the submit button warns that proposals do not change the teaching", async () => {
  const form = await readFile("app/admin/cm/teaching-review/[id]/review-edit-form.tsx", "utf8");
  assert.match(form, /Changes made here are proposals only\. The approved \{subject\} will not change until an Administrator accepts them\./);
  assert.match(form, /subject = "teaching"/, "the wording defaults to teaching; the devotional review passes its own");
  assert.match(form, /Save Draft/);
  assert.match(form, /Submit for Admin Review/);
});

test("the dashboard and the Content Management page link to the review tools", async () => {
  const dashboard = await readFile("app/admin/page.tsx", "utf8");
  assert.match(dashboard, /href: "\/admin\/teaching-revisions"/);
  assert.match(dashboard, /awaiting review/);
  const hub = await readFile("app/admin/cm/page.tsx", "utf8");
  assert.match(hub, /href: "\/admin\/cm\/teaching-review"/);
});

test("the migration locks the tables down and puts every write behind a checked function", async () => {
  const sql = await readFile("supabase/migrations/20261006030000_content_revisions.sql", "utf8");
  assert.match(sql, /alter table public\.content_revisions enable row level security/);
  assert.match(sql, /alter table public\.content_revision_changes enable row level security/);
  assert.match(sql, /revoke all on public\.content_revisions from public, anon, authenticated/);
  assert.match(sql, /revoke all on public\.content_revision_changes from public, anon, authenticated/);
  assert.doesNotMatch(sql, /grant (insert|update|delete|all)[^;]*to authenticated/i, "the app roles can never write the tables directly");
  // Decisions are Administrator-only inside the database.
  for (const name of ["review_teaching_revision_change", "review_all_teaching_revision_changes", "cancel_teaching_revision", "purge_revision_history"]) {
    const body = sql.match(new RegExp(`create or replace function public\\.${name}[\\s\\S]*?\\n\\$\\$;`))?.[0] ?? "";
    assert.notEqual(body, "", `${name} must exist`);
    assert.match(body, /is_authenticated_admin\(\)/, `${name} must check for an Administrator`);
    assert.match(body, /security definer/);
    assert.match(body, /set search_path = public/);
  }
  // Proposals are co-editor functions that check the owner and the revision state.
  const save = sql.match(/create or replace function public\.save_teaching_revision_draft[\s\S]*?\n\$\$;/)?.[0] ?? "";
  assert.match(save, /submitted_by is distinct from v_user/);
  assert.match(save, /v_rev\.status <> 'draft'/);
  // Publishing clears the review text.
  assert.match(sql, /create trigger teachings_close_revisions_on_publish/);
  assert.match(sql, /delete from public\.content_revision_changes/);
});

test("Accept anyway is a separate, explicit, single-change Administrator action", async () => {
  const actions = await readFile("app/admin/teaching-revisions/actions.ts", "utf8");
  assert.match(actions, /\["accept", "accept_anyway", "reject"\]\.includes\(decision\)/);
  assert.match(actions, /p_accept_anyway: decision === "accept_anyway"/);
  // Accept All has no override argument at all.
  const all = actions.match(/export async function reviewAllChanges[\s\S]*?\n}\n/)?.[0] ?? "";
  assert.notEqual(all, "");
  assert.doesNotMatch(all, /accept_anyway/);
  // Co-editors have no way to ask for it.
  const editorActions = await readFile("app/admin/cm/teaching-review/actions.ts", "utf8");
  assert.doesNotMatch(editorActions, /accept_anyway|review_teaching_revision_change/);
});

test("the Accept anyway button appears only on a stale change that still exists, asks first, and says what it will do", async () => {
  const page = await readFile("app/admin/teaching-revisions/[revisionId]/page.tsx", "utf8");
  assert.match(page, /stale && info\.found && teachingIsDraft/);
  assert.match(page, /value="accept_anyway"/);
  assert.match(page, /current wording for this field will be replaced with the proposed wording/);
  assert.match(page, /Accept anyway/);
  const button = await readFile("app/admin/teaching-revisions/confirm-button.tsx", "utf8");
  assert.match(button, /window\.confirm\(message\)/);
});

test("the new migration records overrides and keeps the Administrator-only check", async () => {
  const sql = await readFile("supabase/migrations/20261006040000_content_revision_accept_anyway.sql", "utf8");
  assert.match(sql, /add column if not exists accepted_anyway boolean not null default false/);
  assert.match(sql, /add column if not exists overridden_count integer not null default 0/);
  assert.match(sql, /drop function if exists public\.review_teaching_revision_change\(uuid, text, text\)/);
  const review = sql.match(/create or replace function public\.review_teaching_revision_change[\s\S]*?\n\$\$;/)?.[0] ?? "";
  assert.match(review, /is_authenticated_admin\(\)/);
  assert.match(review, /security definer/);
  assert.match(review, /status = 'draft'/, "nothing can be applied once the teaching is published");
  assert.match(review, /if v_stale and not coalesce\(p_accept_anyway, false\) then/);
  assert.match(review, /does not exist|no longer exists/);
  assert.doesNotMatch(sql, /grant execute[^;]*to anon/i);
});

test("accepted-anyway counts are shown in the history", async () => {
  const list = await readFile("app/admin/teaching-revisions/page.tsx", "utf8");
  assert.match(list, /overridden_count/);
  const detail = await readFile("app/admin/teaching-revisions/[revisionId]/page.tsx", "utf8");
  assert.match(detail, /accepted anyway/);
});
