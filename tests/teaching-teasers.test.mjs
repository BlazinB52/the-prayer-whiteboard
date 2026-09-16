import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("admin teaching form exposes homepage teaser fields with counters", async () => {
  const source = await readFile("app/admin/teachings/teaching-form.tsx", "utf8");
  assert.match(source, /Homepage teasers/);
  assert.match(source, /name="teaser1Heading"/);
  assert.match(source, /name="teaser1Text"/);
  assert.match(source, /name="teaser2Heading"/);
  assert.match(source, /name="teaser2Text"/);
  assert.match(source, /value\.length/);
  assert.match(source, /maxLength=\{100\}/);
  assert.match(source, /maxLength=\{300\}/);
});

test("server actions validate teaser length and teaser 2 completeness", async () => {
  const source = await readFile("app/admin/teachings/actions.ts", "utf8");
  assert.match(source, /teaserHeading:\s*100/);
  assert.match(source, /teaserText:\s*300/);
  assert.match(source, /Boolean\(teaser2Heading\.value\) !== Boolean\(teaser2Text\.value\)/);
  assert.match(source, /teaser_1_heading/);
  assert.match(source, /teaser_2_text/);
});

test("homepage queries teaching teaser fields without highlighted sections", async () => {
  const source = await readFile("app/page.tsx", "utf8");
  assert.match(source, /teaser_1_heading/);
  assert.match(source, /teaser_2_text/);
  assert.match(source, /buildHomepageTeasers/);
  assert.match(source, /HomepageTeaserCard/);
  assert.doesNotMatch(source, /homepageHighlight/);
  assert.doesNotMatch(source, /teaching_sections"\)\.select/);
});

test("homepage teaser cards link to the full teaching and skip empty teaser pairs", async () => {
  const source = await readFile("app/page.tsx", "utf8");
  assert.match(source, /\.filter\(\(teaser\) => teaser\.heading && teaser\.text\)/);
  assert.match(source, /<HomepageTeaserCard key=\{teaser\.id\} teaser=\{teaser\} href=\{teachingPath\}/);
  assert.match(source, /Read the full teaching/);
});

test("public structured teaching page only loads published teachings", async () => {
  const source = await readFile("app/teachings/[slug]/page.tsx", "utf8");
  assert.match(source, /\.from\("teachings"\)\.select\("id, title, gathering_date, central_theme, introduction, summary, status, slug, chalkboard_asset_id"\)\.eq\("slug", slug\)\.eq\("status", "published"\)\.maybeSingle\(\)/);
  assert.match(source, /if \(teachingError \|\| !teaching \|\| teaching\.slug !== slug\) notFound\(\)/);
});

test("section homepage highlight admin UI is removed while legacy JSON is preserved", async () => {
  const workspace = await readFile("app/admin/teachings/content-workspace.tsx", "utf8");
  const actions = await readFile("app/admin/teachings/content-actions.ts", "utf8");
  assert.doesNotMatch(workspace, /Feature on homepage when published/);
  assert.doesNotMatch(workspace, /name="homepageHighlight"/);
  assert.match(actions, /preserveLegacyHomepageHighlight/);
  assert.match(actions, /homepageHighlight: true/);
});

test("teaser migration keeps teaser 1 nullable while publish rpc requires it", async () => {
  const source = await readFile("supabase/migrations/20260916010000_add_teaching_homepage_teasers.sql", "utf8");
  assert.match(source, /teaser_1_heading text/);
  assert.doesNotMatch(source, /teaser_1_heading text not null/i);
  assert.match(source, /Teaser 1 heading is required before publishing/);
  assert.match(source, /teachings_teaser_2_completeness_check/);
});
