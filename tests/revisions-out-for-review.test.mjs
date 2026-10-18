import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const section = await readFile("app/admin/teaching-revisions/out-for-review-section.tsx", "utf8");
const page = await readFile("app/admin/teaching-revisions/page.tsx", "utf8");

test("the Revisions page lists what is out for review, above what is awaiting review", () => {
  assert.ok(page.includes("<OutForReviewSection supabase={supabase} />"));
  assert.ok(page.indexOf("<OutForReviewSection") < page.indexOf("Awaiting review"));
});

test("the list covers every reviewed kind, reading only drafts that were sent", () => {
  for (const table of ["teachings", "teaching_devotionals", "teaching_outlines", "teaching_handouts"]) {
    assert.ok(
      section.includes(`from("${table}").select("id, title, gathering_date, sent_for_review_at").eq("status", "draft").not("sent_for_review_at", "is", null)`),
      table,
    );
  }
  assert.match(section, /from\("weekly_updates"\)[^;]*sent_to_proofing_at/);
  assert.doesNotMatch(section, /\.(insert|update|upsert|delete)\(/, "it only reads");
});

test("each person shows what they have done: not responded, draft, OK, or submitted", () => {
  for (const text of ["has not responded yet", "working on a draft", "marked OK, nothing to change", "submitted "]) assert.ok(section.includes(text), text);
});
