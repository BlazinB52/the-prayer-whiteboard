import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("a half-filled teaser 2 is allowed in a draft only, so co-editor changes can be accepted one at a time", () => {
  const sql = readFileSync(new URL("../supabase/migrations/20261007010000_teaser_2_complete_only_when_published.sql", import.meta.url), "utf8");
  assert.match(sql, /teachings_teaser_2_completeness_check/);
  assert.match(sql, /status = 'draft'\s+or/);
});

test("the edit form and the publish function still require both teaser 2 fields together", () => {
  const actions = readFileSync(new URL("../app/admin/teachings/actions.ts", import.meta.url), "utf8");
  assert.match(actions, /Boolean\(teaser2Heading\.value\) !== Boolean\(teaser2Text\.value\)/);
  const publish = readFileSync(new URL("../supabase/migrations/20260916010000_add_teaching_homepage_teasers.sql", import.meta.url), "utf8");
  assert.match(publish, /teaser_2_heading, ''\)\), ''\) is null\s+and nullif\(trim\(coalesce\(v_teaching\.teaser_2_text/);
});
