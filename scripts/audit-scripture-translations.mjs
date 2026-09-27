#!/usr/bin/env node

// Read-only audit: finds every place Scripture is quoted without a translation
// identified, across both content models used on the site:
//   1. Structured teaching sections (format: "scripture") with no `translation`.
//   2. Devotional day `anchor_scriptures` lines with no recognizable inline
//      translation tag, e.g. "(AMPC)" / "(NKJV)" / "(ESV)" / "(NIV)" / "(AMP)".
//
// This does not modify anything. Run it any time to check for regressions:
//   node --env-file=.env.local scripts/audit-scripture-translations.mjs

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are required.");

const supabase = createClient(url, key);
const TRANSLATION_TAG_PATTERN = /\((AMPC|AMP|NKJV|ESV|NIV|KJV)\)/i;

async function auditTeachingSections() {
  const { data: sections, error } = await supabase
    .from("teaching_sections")
    .select("id, teaching_id, title, content, status, teachings(title, slug, status)")
    .eq("status", "published");
  if (error) throw error;

  const missing = [];
  for (const section of sections ?? []) {
    const content = section.content && typeof section.content === "object" ? section.content : {};
    if (content.format !== "scripture") continue;
    if (content.translation && String(content.translation).trim()) continue;
    const teaching = Array.isArray(section.teachings) ? section.teachings[0] : section.teachings;
    missing.push({
      teaching: teaching?.title ?? "(unknown teaching)",
      slug: teaching?.slug ?? "(unknown slug)",
      section: section.title,
      reference: content.reference ?? "(no reference)",
    });
  }
  return missing;
}

async function auditDevotionalDays() {
  const { data: days, error } = await supabase
    .from("teaching_devotional_days")
    .select("id, devotional_id, day_number, title, anchor_scriptures, teaching_devotionals(title, status)");
  if (error) throw error;

  const missing = [];
  for (const day of days ?? []) {
    const devotional = Array.isArray(day.teaching_devotionals) ? day.teaching_devotionals[0] : day.teaching_devotionals;
    if (devotional?.status !== "published") continue;
    for (const scripture of day.anchor_scriptures ?? []) {
      if (TRANSLATION_TAG_PATTERN.test(scripture)) continue;
      missing.push({
        devotional: devotional?.title ?? "(unknown devotional)",
        day: day.day_number,
        scripture,
      });
    }
  }
  return missing;
}

const [missingSections, missingDevotionalLines] = await Promise.all([auditTeachingSections(), auditDevotionalDays()]);

console.log(`\nTeaching Scripture blocks missing a translation: ${missingSections.length}`);
for (const item of missingSections) {
  console.log(`  - [${item.teaching} / ${item.slug}] section "${item.section}" — ${item.reference}`);
}

console.log(`\nDevotional anchor-scripture lines missing a translation tag: ${missingDevotionalLines.length}`);
for (const item of missingDevotionalLines) {
  console.log(`  - [${item.devotional}] Day ${item.day} — ${item.scripture}`);
}

console.log(`\nTotal: ${missingSections.length + missingDevotionalLines.length} item(s) need a translation identified.`);
