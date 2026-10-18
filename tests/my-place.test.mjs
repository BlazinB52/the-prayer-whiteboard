import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("the Content Managers' review form and the Administrator's editor share one My Place hook", async () => {
  const hook = await readFile("app/admin/use-my-place.ts", "utf8");
  const reviewForm = await readFile("app/admin/cm/teaching-review/[id]/review-edit-form.tsx", "utf8");
  const adminEditor = await readFile("app/admin/text-editor.tsx", "utf8");

  assert.match(hook, /export function useProofed/);
  // Private to the browser: nothing about it is ever sent to the server.
  assert.match(hook, /localStorage/);
  assert.doesNotMatch(hook, /fetch\(|"use server"/);

  for (const source of [reviewForm, adminEditor]) {
    assert.match(source, /from "@\/app\/admin\/use-my-place"/);
    assert.match(source, /Pick up here next time/);
    assert.match(source, /Jump to my place/);
  }
  // The review form no longer carries its own copy of the hook.
  assert.doesNotMatch(reviewForm, /function useProofed/);
});

test("the Administrator's My Place ticks are stored separately from the Content Managers'", async () => {
  const adminEditor = await readFile("app/admin/text-editor.tsx", "utf8");
  const reviewForm = await readFile("app/admin/cm/teaching-review/[id]/review-edit-form.tsx", "utf8");
  assert.match(adminEditor, /admin-place:/);
  assert.match(reviewForm, /review-proofed:/);
});

test("the Administrator's devotional editor has a My Place tick on each day and a Jump to my place link", async () => {
  const editor = await readFile("app/admin/devotionals/devotional-editor.tsx", "utf8");
  assert.match(editor, /from "@\/app\/admin\/use-my-place"/);
  assert.match(editor, /admin-place:/);
  assert.match(editor, /Pick up here next time/);
  assert.match(editor, /Jump to my place/);
  assert.match(editor, /id=\{`devotional-day-\$\{dayNumber\}`\}/);
});
