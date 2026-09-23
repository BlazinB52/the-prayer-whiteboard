import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("teaching devotional page supports assign, change, and remove without deleting content", async () => {
  const [page, form, actions] = await Promise.all([
    readFile("app/admin/teachings/[id]/devotional/page.tsx", "utf8"),
    readFile("app/admin/teachings/[id]/devotional/devotional-assignment-form.tsx", "utf8"),
    readFile("app/admin/teachings/devotional-actions.ts", "utf8"),
  ]);

  assert.match(page, /Use Existing Devotional|DevotionalAssignmentForm/);
  assert.match(page, /teaching_devotional_assignments/);
  assert.match(form, /name="devotionalId"/);
  assert.match(form, /Assign Devotional/);
  assert.match(form, /Remove Association/);
  assert.match(form, /\(\{devotional\.status\}\)/);
  assert.match(actions, /upsert\(\{ teaching_id: teachingId, devotional_id: devotionalId \}, \{ onConflict: "teaching_id" \}\)/);
  assert.match(actions, /from\("teaching_devotional_assignments"\)[\s\S]*?\.delete\(\)[\s\S]*?\.eq\("teaching_id", teaching\.id\)/);
  const removeAction = actions.match(/export async function removeDevotionalAssignment[\s\S]*?export async function updateDevotionalSeries/)?.[0] ?? "";
  assert.doesNotMatch(removeAction, /from\("teaching_devotionals"\)[\s\S]*?\.delete\(\)/);
});

test("Storehouse resolves published devotional slugs through reusable assignments", async () => {
  const [source, publicDevotionals, overview, day] = await Promise.all([
    readFile("app/page.tsx", "utf8"),
    readFile("lib/public-devotionals.ts", "utf8"),
    readFile("app/teachings/[slug]/devotional/page.tsx", "utf8"),
    readFile("app/teachings/[slug]/devotional/day/[dayNumber]/page.tsx", "utf8"),
  ]);
  const lookup = source.match(/async function getPublishedDevotionalSlugsByTeachingId[\s\S]*?async function getFeaturedHomepageData/)?.[0] ?? "";
  assert.match(lookup, /from\("teaching_devotional_assignments"\)/);
  assert.match(lookup, /select\("teaching_id, devotional_id"\)/);
  assert.match(lookup, /from\("teaching_devotionals"\)/);
  assert.match(lookup, /\.eq\("status", "published"\)/);
  assert.match(source, /href={`\/devotionals\/\$\{devotionalSlug\}`}/);

  const teachingLookup = publicDevotionals.match(/export async function getPublishedDevotionalSeriesByTeachingSlug[\s\S]*$/)?.[0] ?? "";
  assert.match(teachingLookup, /from\("teaching_devotional_assignments"\)[\s\S]*?eq\("teaching_id", teaching\.id\)/);
  assert.match(teachingLookup, /from\("teaching_devotionals"\)[\s\S]*?eq\("id", assignment\.devotional_id\)/);
  assert.match(overview, /getPublishedDevotionalSeriesByTeachingSlug\(slug\)/);
  assert.match(day, /getPublishedDevotionalSeriesByTeachingSlug\(slug\)/);
});

test("assignment migration backfills ownership without a recursive public policy", async () => {
  const migration = await readFile("supabase/migrations/20260919010000_add_teaching_devotional_assignments.sql", "utf8");
  assert.match(migration, /create table if not exists public\.teaching_devotional_assignments/);
  assert.match(migration, /teaching_id uuid primary key/);
  assert.match(migration, /insert into public\.teaching_devotional_assignments[\s\S]*?select teaching_id, id[\s\S]*?from public\.teaching_devotionals/);
  const assignmentPolicy = migration.match(/create policy "Public can read published teaching devotional assignments"[\s\S]*?create policy "Admins manage teaching devotional assignments"/)?.[0] ?? "";
  assert.match(assignmentPolicy, /from public\.teachings t/);
  assert.doesNotMatch(assignmentPolicy, /from public\.teaching_devotionals|join public\.teaching_devotionals/);
});

test("the public devotional list resolves teachings through assignments, not the legacy column", async () => {
  const publicDevotionals = await readFile("lib/public-devotionals.ts", "utf8");
  const listing = publicDevotionals.match(/export async function getPublishedDevotionalSeries\(\)[\s\S]*?\n}/)?.[0] ?? "";

  assert.notEqual(listing, "", "getPublishedDevotionalSeries should be present");
  assert.match(listing, /from\("teaching_devotional_assignments"\)/);
  assert.match(listing, /select\("teaching_id, devotional_id"\)/);
  assert.match(listing, /\.in\("devotional_id",/);
  assert.match(listing, /from\("teachings"\)[\s\S]*?\.eq\("status", "published"\)/);

  // The teaching must never be looked up by the legacy owner column again.
  // It may still be read as a tie-breaker when one devotional is shared by
  // several published teachings, but not to resolve the teaching itself.
  assert.doesNotMatch(listing, /teachingsById\.get\(devotional\.teaching_id\)/);
  assert.doesNotMatch(listing, /\.in\("id", teachingIds\)/);
});
