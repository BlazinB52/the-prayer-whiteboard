import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { blockPlainText, compareBlocks } from "../lib/weekly-update-compare.ts";

const migration = await readFile("supabase/migrations/20261011010000_admin_edit_weekly_update_text.sql", "utf8");
const actions = await readFile("app/admin/weekly-updates/[id]/edit-text/actions.ts", "utf8");
const page = await readFile("app/admin/weekly-updates/[id]/edit-text/page.tsx", "utf8");
const editor = await readFile("app/admin/weekly-updates/[id]/edit-text/text-editor.tsx", "utf8");
const listPage = await readFile("app/admin/weekly-updates/page.tsx", "utf8");

const paragraph = (text, bold) => ({ type: "paragraph", children: [{ text, ...(bold ? { bold: true } : {}) }] });

test("the comparison reports only the paragraphs whose wording differs, by position", () => {
  const original = [paragraph("Dear Prayer Family,"), paragraph("Prayer is not confined to one room."), paragraph("Closing line.")];
  const current = [paragraph("Dear Prayer Family,"), paragraph("Corporate prayer is not confined to one room."), paragraph("Closing line.")];
  const { differences, sameLength } = compareBlocks(original, current);
  assert.equal(sameLength, true);
  assert.deepEqual(differences, [{ position: 2, original: "Prayer is not confined to one room.", current: "Corporate prayer is not confined to one room." }]);
});

test("formatting alone is not reported, and a list compares line by line", () => {
  assert.equal(compareBlocks([paragraph("Same words")], [paragraph("Same words", true)]).differences.length, 0);
  const list = (items) => ({ type: "list", items: items.map((text) => [{ text }]) });
  const { differences } = compareBlocks([list(["One", "Two"])], [list(["One", "Two changed"])]);
  assert.equal(differences.length, 1);
  assert.equal(differences[0].current, "One\nTwo changed");
  assert.equal(blockPlainText(list(["A", "B"])), "A\nB");
});

test("added or removed paragraphs are reported rather than hidden", () => {
  const { differences, sameLength } = compareBlocks([paragraph("A")], [paragraph("A"), paragraph("B")]);
  assert.equal(sameLength, false);
  assert.deepEqual(differences, [{ position: 2, original: "", current: "B" }]);
});

test("only an Administrator can edit the text, only of a draft, and only against the wording they started from", () => {
  assert.match(migration, /is_authenticated_admin\(\)/);
  assert.match(migration, /status = 'draft'/);
  assert.match(migration, /conflict: A paragraph was changed by someone else while you were editing\./);
  // Edits go through the same function the review editor uses, so bold, italic and links survive.
  assert.match(migration, /perform public\.revision_weekly_apply_value\(/);
  assert.match(migration, /grant execute on function public\.admin_edit_weekly_update_text\(uuid, jsonb\) to authenticated/);
  assert.match(migration, /revoke all on function public\.admin_edit_weekly_update_text\(uuid, jsonb\) from public, anon/);
});

test("the save sends only paragraphs that changed, each with its starting wording", () => {
  assert.match(actions, /await requireAdmin\(\)/);
  assert.match(actions, /normalizeRevisionText\(proposed\) === normalizeRevisionText\(base\)\) continue/);
  assert.match(actions, /rpc\("admin_edit_weekly_update_text"/);
  assert.match(actions, /fieldKey !== "title" && !\/\^block_\[0-9\]\+\$\/\.test\(fieldKey\)/);
  assert.equal(/publish_weekly_update|broadcast|email_broadcast/.test(actions), false, "saving text never publishes or emails");
});

test("after a save the editor starts from what was saved, so a second save does not conflict", () => {
  assert.match(editor, /if \(state\.savedCount !== undefined\) setBases\(values\)/);
});

test("the edit page is admin-only, draft-only and shows what changed since the upload", () => {
  assert.match(page, /await requireAdmin\(\)/);
  assert.match(page, /\.eq\("status", "draft"\)/);
  assert.match(page, /compareBlocks\(original\.blocks, currentBlocks\)/);
  assert.match(page, /Changed since the uploaded Word document/);
  assert.match(page, /max-h-\[32rem\][^"]*overflow-y-auto/);
});

test("each draft in the admin list links to the editor", () => {
  assert.match(listPage, /href=\{`\/admin\/weekly-updates\/\$\{update\.id\}\/edit-text`\}/);
  assert.match(listPage, /update\.status === "draft" \? \(\s*<div className="mt-4 flex flex-wrap items-center gap-3">\s*<Link href=\{`\/admin\/weekly-updates\/\$\{update\.id\}\/edit-text`\}/);
});
