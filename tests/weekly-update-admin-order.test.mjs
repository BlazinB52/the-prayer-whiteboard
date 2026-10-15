import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("the admin weekly updates list is ordered by gathering date, newest first, with undated letters first", async () => {
  const page = await readFile("app/admin/weekly-updates/page.tsx", "utf8");
  assert.match(page, /if \(!a\.gathering_date !== !b\.gathering_date\) return a\.gathering_date \? 1 : -1;/);
  assert.match(page, /String\(b\.gathering_date \?\? ""\)\.localeCompare\(String\(a\.gathering_date \?\? ""\)\) \|\| String\(b\.updated_at\)\.localeCompare\(String\(a\.updated_at\)\)/);
  assert.match(page, /group\.items\.map\(\(update\)/);

  // The same ordering the page uses.
  const sort = (items) => [...items].sort((a, b) => {
    if (!a.gathering_date !== !b.gathering_date) return a.gathering_date ? 1 : -1;
    return String(b.gathering_date ?? "").localeCompare(String(a.gathering_date ?? "")) || String(b.updated_at).localeCompare(String(a.updated_at));
  });
  const ordered = sort([
    { id: "oct-3", gathering_date: "2026-10-03", updated_at: "2026-10-20" },
    { id: "oct-10-old-edit", gathering_date: "2026-10-10", updated_at: "2026-10-01" },
    { id: "undated", gathering_date: null, updated_at: "2026-09-01" },
    { id: "oct-10-new-edit", gathering_date: "2026-10-10", updated_at: "2026-10-12" },
  ]).map((item) => item.id);
  assert.deepEqual(ordered, ["undated", "oct-10-new-edit", "oct-10-old-edit", "oct-3"]);
});
