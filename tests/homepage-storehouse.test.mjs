import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Storehouse keeps only published standard teachings eligible for its devotional link", async () => {
  const source = await readFile("app/page.tsx", "utf8");
  const fallbackQuery = source.match(/async function getPreviousGatherings[\s\S]*?async function getPublishedDevotionalSlugsByTeachingId/)?.[0] ?? "";
  const featuredQuery = source.match(/async function getFeaturedHomepageData[\s\S]*?function buildHomepageTeasers/)?.[0] ?? "";

  for (const query of [fallbackQuery, featuredQuery]) {
    assert.match(query, /\.select\("id, slug, title, gathering_date"\)/);
    assert.match(query, /\.eq\("status", "published"\)/);
    assert.match(query, /\.eq\("teaching_type", "standard"\)/);
  }
  assert.equal(featuredQuery.match(/\.eq\("teaching_type", "standard"\)/g)?.length, 2);

  assert.match(source, /\.from\("teaching_devotional_assignments"\)[\s\S]*?\.select\("teaching_id, devotional_id"\)/);
  assert.match(source, /\.from\("teaching_devotionals"\)[\s\S]*?\.select\("id, slug"\)[\s\S]*?\.eq\("status", "published"\)/);
  assert.match(source, /href={`\/devotionals\/\$\{devotionalSlug\}`}/);
});
