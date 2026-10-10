import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("the admin weekly updates list shows drafts first, then current published, then the archive", async () => {
  const page = await readFile("app/admin/weekly-updates/page.tsx", "utf8");

  // The same ranking the page uses, so this fails if the ranks or their order are changed.
  const rank = page.match(/const listRank = .*$/m)?.[0] ?? "";
  assert.match(rank, /item\.status === "draft" \? 0 : item\.is_current \? 1 : 2/);
  assert.match(page, /listRank\(a\) - listRank\(b\) \|\| String\(b\.updated_at\)\.localeCompare\(String\(a\.updated_at\)\)/);
  assert.match(page, /sortedUpdates\.map\(\(update\)/);

  const listRank = (item) => (item.status === "draft" ? 0 : item.is_current ? 1 : 2);
  const sort = (items) => [...items].sort((a, b) => listRank(a) - listRank(b) || String(b.updated_at).localeCompare(String(a.updated_at)));
  const ordered = sort([
    { id: "current", status: "published", is_current: true, updated_at: "2026-10-09" },
    { id: "old", status: "archived", is_current: false, updated_at: "2026-10-01" },
    { id: "draft-newer", status: "draft", is_current: false, updated_at: "2026-10-08" },
    { id: "draft-older", status: "draft", is_current: false, updated_at: "2026-10-02" },
    { id: "current-es", status: "published", is_current: true, updated_at: "2026-10-10" },
  ]).map((item) => item.id);
  assert.deepEqual(ordered, ["draft-newer", "draft-older", "current-es", "current", "old"]);
});
