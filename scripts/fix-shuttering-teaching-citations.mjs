#!/usr/bin/env node

// One-time fix: adds "(NKJV)" to verbatim Scripture quotations embedded in
// plain paragraph text on the "Shuttering the Past and Moving Forward in
// Love" teaching (these are outside the structured `format: "scripture"`
// blocks the earlier sweep covered, so they were missed), and to the shared
// reusable footer's uncredited Matthew 18:19 quote (used across several
// teaching pages). Each replacement targets exact, known-verbatim text
// confirmed against NKJV wording.
//
// Dry run (default):  node --env-file=.env.local scripts/fix-shuttering-teaching-citations.mjs
// Apply:               APPLY_FIX=true node --env-file=.env.local scripts/fix-shuttering-teaching-citations.mjs

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are required.");

const APPLY = process.env.APPLY_FIX === "true";
const supabase = createClient(url, key);

const SECTION_FIXES = [
  { sectionId: "d07d2a00-3fbd-408f-a03a-213acd167c55", find: "**James 1:17**", replace: "**James 1:17 (NKJV)**" },
  { sectionId: "2c79aa2d-188e-4648-a91e-a2aaf299c167", find: "**2 Corinthians 5:21**", replace: "**2 Corinthians 5:21 (NKJV)**" },
  { sectionId: "2c79aa2d-188e-4648-a91e-a2aaf299c167", find: "**Jeremiah 23:6**", replace: "**Jeremiah 23:6 (NKJV)**" },
  { sectionId: "989c06f8-b674-473e-a52f-bc2b9a6b8330", find: "** Proverbs 29:2**", replace: "** Proverbs 29:2 (NKJV)**" },
];

async function fixSections() {
  const results = [];
  for (const fix of SECTION_FIXES) {
    const { data: section } = await supabase.from("teaching_sections").select("id, title, content").eq("id", fix.sectionId).maybeSingle();
    if (!section) { results.push({ ...fix, status: "section not found" }); continue; }
    if (!section.content.text.includes(fix.find)) { results.push({ ...fix, status: "text not found (already fixed?)", title: section.title }); continue; }
    if (section.content.text.includes(fix.replace)) { results.push({ ...fix, status: "already tagged", title: section.title }); continue; }

    const newText = section.content.text.replace(fix.find, fix.replace);
    if (APPLY) {
      const { error } = await supabase.from("teaching_sections").update({ content: { ...section.content, text: newText } }).eq("id", fix.sectionId);
      results.push({ ...fix, status: error ? `error: ${error.message}` : "updated", title: section.title });
    } else {
      results.push({ ...fix, status: "would update", title: section.title });
    }
  }
  return results;
}

async function fixSharedFooter() {
  const find = '"Again, I say to you, if two of you agree on earth about anything they ask, it will be done for them by my Father in heaven." — Matthew 18:19';
  const replace = '"Again, I say to you, if two of you agree on earth about anything they ask, it will be done for them by my Father in heaven." — Matthew 18:19 (NKJV)';

  const { data: footers } = await supabase.from("content_footers").select("id, internal_title, content").ilike("content", "%Matthew 18:19%");
  const results = [];
  for (const footer of footers ?? []) {
    if (!footer.content.includes(find)) { results.push({ id: footer.id, title: footer.internal_title, status: "text not found (different wording?)" }); continue; }
    if (footer.content.includes("Matthew 18:19 (NKJV)")) { results.push({ id: footer.id, title: footer.internal_title, status: "already tagged" }); continue; }

    const newContent = footer.content.replace(find, replace);
    if (APPLY) {
      const { error } = await supabase.from("content_footers").update({ content: newContent }).eq("id", footer.id);
      results.push({ id: footer.id, title: footer.internal_title, status: error ? `error: ${error.message}` : "updated" });
    } else {
      results.push({ id: footer.id, title: footer.internal_title, status: "would update" });
    }
  }
  return results;
}

const [sectionResults, footerResults] = await Promise.all([fixSections(), fixSharedFooter()]);

console.log(`\n${APPLY ? "APPLYING" : "DRY RUN"} — Teaching section quotes (${sectionResults.length}):`);
for (const r of sectionResults) console.log(`  [${r.status}] ${r.title ?? r.sectionId}: ${r.find} -> ${r.replace}`);

console.log(`\n${APPLY ? "APPLYING" : "DRY RUN"} — Shared footer(s) (${footerResults.length}):`);
for (const r of footerResults) console.log(`  [${r.status}] ${r.title} (${r.id})`);

if (!APPLY) console.log("\nDry run only. Re-run with APPLY_FIX=true to write these changes.");
