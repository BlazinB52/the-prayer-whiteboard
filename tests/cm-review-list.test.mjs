import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildReviewList } from "../lib/cm-review-list.ts";

const empty = { teaching: [], devotional: [], weekly_update: [], outline: [], handout: [] };

test("the list holds everything sent for review, whatever it is, newest gathering first", () => {
  const { needsReview } = buildReviewList({
    sources: {
      ...empty,
      teaching: [{ id: "t1", title: "Teaching A", gathering_date: "2026-10-03", sent_at: "2026-10-05T12:00:00Z" }],
      handout: [{ id: "h1", title: "Handout A", gathering_date: "2026-10-10", sent_at: "2026-10-08T12:00:00Z", language: "es" }],
      weekly_update: [{ id: "w1", title: "Update A", gathering_date: "2026-10-10", sent_at: "2026-10-07T12:00:00Z" }],
      devotional: [{ id: "d1", title: "Devotional A", gathering_date: null, sent_at: "2026-10-01T12:00:00Z" }],
    },
    myRevisions: [],
    submittedWeeklyUpdates: new Set(),
  });
  assert.deepEqual(needsReview.map((item) => item.key), ["weekly_update:w1", "handout:h1", "teaching:t1", "devotional:d1"], "same date: sent earliest first; no date last");
  const handout = needsReview.find((item) => item.kind === "handout");
  assert.equal(handout.kindLabel, "Handout");
  assert.equal(handout.language, "es");
  assert.equal(handout.href, "/admin/cm/handout-review/h1");
  assert.equal(needsReview.find((item) => item.kind === "weekly_update").href, "/admin/cm/weekly-update-review/w1");
});

test("what a person has already sent in leaves the list and appears in their edits; a draft stays and says so", () => {
  const revisions = [
    { id: "r1", kind: "teaching", subjectId: "t1", title: "Teaching A", status: "submitted", submitted_at: "2026-10-06T12:00:00Z", completed_at: null, total_changes: 3, accepted_count: 0, rejected_count: 0 },
    { id: "r2", kind: "outline", subjectId: "o1", title: "Outline A", status: "draft", submitted_at: null, completed_at: null, total_changes: 0, accepted_count: 0, rejected_count: 0 },
    { id: "r3", kind: "devotional", subjectId: "d9", title: "Old devotional", status: "completed", submitted_at: "2026-09-01T12:00:00Z", completed_at: "2026-09-03T12:00:00Z", total_changes: 5, accepted_count: 4, rejected_count: 1 },
  ];
  const { needsReview, history } = buildReviewList({
    sources: {
      ...empty,
      teaching: [{ id: "t1", title: "Teaching A", gathering_date: "2026-10-03" }],
      outline: [{ id: "o1", title: "Outline A", gathering_date: "2026-10-03" }],
      weekly_update: [{ id: "w1", title: "Update A", gathering_date: "2026-10-10" }, { id: "w2", title: "Update B", gathering_date: "2026-10-17" }],
    },
    myRevisions: revisions,
    submittedWeeklyUpdates: new Set(["w1"]),
  });
  assert.deepEqual(needsReview.map((item) => item.key), ["weekly_update:w2", "outline:o1"]);
  assert.equal(needsReview.find((item) => item.key === "outline:o1").started, true);
  assert.deepEqual(history.map((entry) => entry.key), ["r1", "r3"]);
  assert.equal(history[0].summary, "3 proposed changes, waiting on the Administrator");
  assert.equal(history[1].summary, "4 accepted, 1 rejected");
});

test("nothing sent means an empty list, not a list of everything", () => {
  assert.deepEqual(buildReviewList({ sources: empty, myRevisions: [], submittedWeeklyUpdates: new Set() }), { needsReview: [], history: [] });
});

test("the Content Management home is the review list plus only the two places a Content Manager creates", async () => {
  const page = await readFile("app/admin/cm/page.tsx", "utf8");
  assert.match(page, /Needs your review/);
  assert.match(page, /Your edits/);
  assert.match(page, /title: "Points of Agreement"/);
  assert.match(page, /title: "Pray for Those in Authority"/);
  for (const removed of ["Full Teaching - Review", "Devotional - Review", "Weekly Update - Review", "Teaching Outline - Review", "Handout - Review"]) {
    assert.doesNotMatch(page, new RegExp(`title: "${removed}"`), `${removed} is no longer a card`);
  }
  assert.equal((page.match(/status: "Available"/g) ?? []).length, 2, "only the two that create something say Available");
  assert.match(page, /\.not\("sent_for_review_at", "is", null\)/);
});

test("an item marked reviewed with no changes leaves the list and shows in their edits", () => {
  const { needsReview, history } = buildReviewList({
    sources: { ...empty, teaching: [{ id: "t1", title: "Teaching A", gathering_date: "2026-10-03" }, { id: "t2", title: "Teaching B", gathering_date: "2026-10-10" }] },
    myRevisions: [],
    submittedWeeklyUpdates: new Set(),
    reviewedNoChanges: new Map([["teaching:t1", "2026-10-06T12:00:00Z"]]),
  });
  assert.deepEqual(needsReview.map((item) => item.key), ["teaching:t2"]);
  assert.equal(history.length, 1);
  assert.equal(history[0].summary, "Reviewed, no changes needed");
  assert.equal(history[0].title, "Teaching A");
});

test("every review page offers Mark as reviewed, no changes, and the database function clears an empty draft and refuses real changes", async () => {
  for (const kind of ["teaching", "devotional", "outline", "handout"]) {
    const page = await readFile(`app/admin/cm/${kind}-review/[id]/page.tsx`, "utf8");
    assert.match(page, new RegExp(`<ReviewOkBox kind="${kind}"`));
    assert.match(page, /<ReviewOkMessage reviewed=\{flags\.reviewed\} \/>/);
  }
  const box = await readFile("app/admin/cm/review-ok-box.tsx", "utf8");
  assert.match(box, /Mark as reviewed, no changes/);
  const actions = await readFile("app/admin/cm/review-ok-actions.ts", "utf8");
  assert.match(actions, /rpc\("mark_review_ok"/);
  assert.match(actions, /rpc\("clear_review_ok"/);
  const sql = await readFile("supabase/migrations/20261016020000_review_no_changes.sql", "utf8");
  assert.match(sql, /Submit or discard your proposed changes first/);
  assert.match(sql, /revoke all on public\.content_review_oks from public, anon, authenticated/);
  const gate = await readFile("app/admin/review-gate-section.tsx", "utf8");
  assert.match(gate, /reviewed it with no changes needed/);
});
