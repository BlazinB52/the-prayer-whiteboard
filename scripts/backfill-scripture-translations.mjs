#!/usr/bin/env node

// One-time backfill: adds the correct translation to every Scripture citation
// found missing by scripts/audit-scripture-translations.mjs. Each mapping
// below was determined by an exact wording match against BibleGateway, not
// guessed -- see the conversation history for the verification.
//
// Devotional anchor-scripture lines are stored as full "Reference: quote"
// strings with no separate translation column, so the tag is inserted as
// " (TAG)" right after the reference, before the colon.
//
// Dry run (default):  node --env-file=.env.local scripts/backfill-scripture-translations.mjs
// Apply:               APPLY_BACKFILL=true node --env-file=.env.local scripts/backfill-scripture-translations.mjs

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are required.");

const APPLY = process.env.APPLY_BACKFILL === "true";
const supabase = createClient(url, key);

const TEACHING_SECTION_FIXES = [
  { teachingSlug: "speaking-spirits-dominion-and-the-greater-life-in-christ", reference: "Romans 8:1", translation: "AMPC" },
];

// Keyed by devotional title -> day number -> array of [referencePrefix, translation]
// in the order the anchor_scriptures lines appear for that day.
const DEVOTIONAL_FIXES = {
  "The Spiritual Ascent": {
    1: [["Ezekiel 11:17", "NIV"], ["Jeremiah 31:3", "NIV"]],
    2: [["Isaiah 61:4", "NIV"], ["Romans 12:2", "NIV"]],
    3: [["Psalm 122:6", "NIV"], ["2 Thessalonians 2:7", "NIV"]],
    4: [["Proverbs 18:21", "KJV"], ["Zechariah 8:8", "AMPC"]],
    5: [["Jeremiah 31:13", "NIV"], ["Romans 11:26", "NIV"]],
    6: [["Isaiah 49:22", "NIV"], ["John 4:35", "NIV"]],
    7: [["Isaiah 61:7", "NIV"], ["Psalm 24:3", "NIV"]],
  },
  "Beyond the Garden": {
    1: [["Genesis 1:26", "AMPC"], ["Proverbs 18:21", "KJV"]],
    2: [["James 3:4", "ESV"]],
    3: [["Matthew 12:36", "AMPC"], ["1 Corinthians 3:13", "AMPC"]],
    4: [["Genesis 3:1", "AMPC"], ["Hebrews 10:23", "KJV"]],
    5: [["1 Thessalonians 5:23", "AMPC"], ["Romans 8:6", "NKJV"]],
    6: [["Romans 5:17", "AMPC"], ["John 11:25", "AMPC"]],
    7: [["Galatians 5:1", "AMPC"], ["1 John 1:9", "AMPC"]],
  },
  "5787: The Year of the Spoken Word and Divine Rest": {
    1: [["Proverbs 18:21", "KJV"], ["Ephesians 6:17", "NKJV"]],
    2: [["Exodus 14:13", "NKJV"], ["2 Chronicles 20:15", "NKJV"]],
    3: [["Malachi 3:3", "NKJV"], ["Romans 12:2", "NKJV"]],
    4: [["Psalm 119:60", "NKJV"], ["Exodus 14:15", "NKJV"]],
    5: [["Colossians 1:18", "NKJV"], ["Galatians 2:20", "NKJV"]],
    6: [["Isaiah 30:15", "NKJV"], ["Acts 3:19", "NKJV"]],
    7: [["2 Chronicles 20:21", "NKJV"], ["Psalm 100:4", "NKJV"]],
  },
  "Shuttering the Past and Moving Forward in Love": {
    1: [["Isaiah 43:18", "NKJV"], ["Philippians 3:13", "NKJV"]],
    2: [["Isaiah 26:3", "NKJV"], ["John 3:16", "NKJV"], ["James 1:17", "NKJV"]],
    3: [["John 13:34", "NKJV"], ["1 Corinthians 13:4", "NKJV"]],
    4: [["2 Corinthians 5:21", "NKJV"], ["Jeremiah 23:6", "NKJV"]],
    5: [["1 Corinthians 11:23", "NKJV"], ["John 14:9", "NKJV"], ["1 Corinthians 12:12", "NKJV"]],
    6: [["Proverbs 29:2", "NKJV"], ["Matthew 18:19", "NKJV"]],
    7: [["John 14:15", "NKJV"], ["Galatians 5:1", "NKJV"], ["Matthew 18:19", "NKJV"]],
  },
};

function insertTag(scripture, translation) {
  const colonIndex = scripture.indexOf(":", scripture.search(/\d/));
  // Insert " (TAG)" right before the colon that separates the reference from the quote.
  const firstColon = scripture.indexOf(":");
  if (firstColon === -1) return `${scripture} (${translation})`;
  // References like "James 3:4–5:" have a colon inside the reference itself
  // (chapter:verse) before the one separating reference from quote. Find the
  // colon that is followed by a space and a quotation mark / capital letter,
  // which marks the reference/quote boundary in this content.
  const boundaryMatch = scripture.match(/:\s*[“"]/);
  const boundary = boundaryMatch ? boundaryMatch.index : firstColon;
  return `${scripture.slice(0, boundary)} (${translation})${scripture.slice(boundary)}`;
}

async function backfillTeachingSections() {
  const results = [];
  for (const fix of TEACHING_SECTION_FIXES) {
    const { data: teaching } = await supabase.from("teachings").select("id").eq("slug", fix.teachingSlug).maybeSingle();
    if (!teaching) { results.push({ ...fix, status: "teaching not found" }); continue; }

    const { data: sections } = await supabase
      .from("teaching_sections")
      .select("id, content")
      .eq("teaching_id", teaching.id)
      .eq("status", "published");

    const match = (sections ?? []).find((s) => s.content?.format === "scripture" && s.content?.reference === fix.reference && !s.content?.translation);
    if (!match) { results.push({ ...fix, status: "section not found or already tagged" }); continue; }

    const newContent = { ...match.content, translation: fix.translation };
    if (APPLY) {
      const { error } = await supabase.from("teaching_sections").update({ content: newContent }).eq("id", match.id);
      results.push({ ...fix, status: error ? `error: ${error.message}` : "updated" });
    } else {
      results.push({ ...fix, status: "would update", before: match.content, after: newContent });
    }
  }
  return results;
}

async function backfillDevotionalDays() {
  const results = [];
  for (const [devotionalTitle, days] of Object.entries(DEVOTIONAL_FIXES)) {
    const { data: devotional } = await supabase.from("teaching_devotionals").select("id").eq("title", devotionalTitle).maybeSingle();
    if (!devotional) { results.push({ devotionalTitle, status: "devotional not found" }); continue; }

    for (const [dayNumber, fixes] of Object.entries(days)) {
      const { data: day } = await supabase
        .from("teaching_devotional_days")
        .select("id, anchor_scriptures")
        .eq("devotional_id", devotional.id)
        .eq("day_number", Number(dayNumber))
        .maybeSingle();
      if (!day) { results.push({ devotionalTitle, dayNumber, status: "day not found" }); continue; }

      const scriptures = [...day.anchor_scriptures];
      let changed = false;
      for (const [referencePrefix, translation] of fixes) {
        const index = scriptures.findIndex((s) => s.startsWith(referencePrefix) && !new RegExp(`^${referencePrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^:]*\\(`).test(s));
        if (index === -1) { results.push({ devotionalTitle, dayNumber, referencePrefix, status: "line not found or already tagged" }); continue; }
        const before = scriptures[index];
        scriptures[index] = insertTag(before, translation);
        changed = true;
        results.push({ devotionalTitle, dayNumber, referencePrefix, status: APPLY ? "updated" : "would update", before, after: scriptures[index] });
      }

      if (changed && APPLY) {
        const { error } = await supabase.from("teaching_devotional_days").update({ anchor_scriptures: scriptures }).eq("id", day.id);
        if (error) results.push({ devotionalTitle, dayNumber, status: `error: ${error.message}` });
      }
    }
  }
  return results;
}

const [teachingResults, devotionalResults] = await Promise.all([backfillTeachingSections(), backfillDevotionalDays()]);

console.log(`\n${APPLY ? "APPLYING" : "DRY RUN"} — Teaching sections (${teachingResults.length}):`);
for (const r of teachingResults) console.log(`  [${r.status}] ${r.reference} -> ${r.translation}`);

console.log(`\n${APPLY ? "APPLYING" : "DRY RUN"} — Devotional lines (${devotionalResults.length}):`);
for (const r of devotionalResults) {
  if (r.before) console.log(`  [${r.status}] ${r.devotionalTitle} Day ${r.dayNumber}:\n    before: ${r.before}\n    after:  ${r.after}`);
  else console.log(`  [${r.status}] ${r.devotionalTitle} Day ${r.dayNumber ?? ""} ${r.referencePrefix ?? ""}`);
}

if (!APPLY) console.log("\nDry run only. Re-run with APPLY_BACKFILL=true to write these changes.");
