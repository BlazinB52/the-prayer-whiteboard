import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("admin teaching form saves Deep Dive classification and keeps standard default", async () => {
  const form = await readFile("app/admin/teachings/teaching-form.tsx", "utf8");
  const newPage = await readFile("app/admin/teachings/new/page.tsx", "utf8");
  const actions = await readFile("app/admin/teachings/actions.ts", "utf8");
  assert.match(form, /Deep Dive teaching/);
  assert.match(form, /name="teachingType" value="deep_dive"/);
  assert.match(form, /value="deep_dive"/);
  assert.match(newPage, /teachingType: "standard"/);
  assert.match(actions, /formData\.get\("teachingType"\) === "deep_dive" \? "deep_dive" : "standard"/);
});

test("admin teaching form hides homepage teasers for Deep Dives without dropping stored values", async () => {
  const source = await readFile("app/admin/teachings/teaching-form.tsx", "utf8");
  assert.match(source, /const showHomepageTeasers = draftValues\.teachingType !== "deep_dive"/);
  assert.match(source, /\{showHomepageTeasers \? \(/);
  assert.match(source, /<input type="hidden" name="teaser1Heading" value=\{draftValues\.teaser1Heading\}/);
  assert.match(source, /<input type="hidden" name="teaser1Text" value=\{draftValues\.teaser1Text\}/);
  assert.match(source, /<input type="hidden" name="teaser2Heading" value=\{draftValues\.teaser2Heading\}/);
  assert.match(source, /<input type="hidden" name="teaser2Text" value=\{draftValues\.teaser2Text\}/);
});

test("short summary app limit accepts planned Deep Dive length without database changes", async () => {
  const form = await readFile("app/admin/teachings/teaching-form.tsx", "utf8");
  const actions = await readFile("app/admin/teachings/actions.ts", "utf8");
  assert.match(form, /name="summary"[\s\S]*maxLength=\{800\}/);
  assert.match(actions, /summary: 800/);
});

test("Deep Dives collection queries only published deep_dive teachings", async () => {
  const source = await readFile("app/deep-dives/page.tsx", "utf8");
  assert.match(source, /\.from\("teachings"\)/);
  assert.match(source, /\.eq\("status", "published"\)/);
  assert.match(source, /\.eq\("teaching_type", "deep_dive"\)/);
  assert.match(source, /DeepDiveCard/);
});

test("Deep Dives collection shows Coming Soon only when no real published Deep Dives exist", async () => {
  const source = await readFile("app/deep-dives/page.tsx", "utf8");
  assert.match(source, /deepDives\.length \? \(/);
  assert.match(source, /<ComingSoonDeepDive \/>/);
  assert.match(source, /Our First Deep Dive/);
  assert.match(source, /A deeper study is being prepared for The Prayer Whiteboard/);
});

test("homepage links to Deep Dives without changing featured teaching stream", async () => {
  const source = await readFile("app/page.tsx", "utf8");
  assert.match(source, /\{ href: "\/deep-dives", label: "Deep Dives" \}/);
  assert.match(source, /Explore Deep Dives/);
  assert.match(source, /\.eq\("teaching_type", "standard"\)/);
  assert.match(source, /Launch Out Into the Deep/);
});

test("public structured teaching page supports subtle Deep Dive treatment", async () => {
  const source = await readFile("app/teachings/[slug]/page.tsx", "utf8");
  assert.match(source, /teaching_type/);
  assert.match(source, /teachingType === "deep_dive"/);
  assert.match(source, /Deep Dives Collection/);
});

test("Deep Dive migration adds teaching_type and type-aware publishing", async () => {
  const source = await readFile("supabase/migrations/20260916020000_add_teaching_deep_dives.sql", "utf8");
  assert.match(source, /add column if not exists teaching_type text not null default 'standard'/);
  assert.match(source, /check \(teaching_type in \('standard', 'deep_dive'\)\)/);
  assert.match(source, /v_teaching\.teaching_type = 'standard'/);
  assert.match(source, /if v_teaching\.teaching_type = 'standard' then[\s\S]*Teaser 1 heading is required before publishing/);
  assert.match(source, /is_featured = case when v_teaching\.teaching_type = 'standard' then true else false end/);
});
