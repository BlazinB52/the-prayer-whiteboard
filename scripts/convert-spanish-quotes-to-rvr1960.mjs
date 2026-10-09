#!/usr/bin/env node

// One-time conversion: replace the wording of every Spanish Scripture quotation
// with the actual Reina-Valera 1960 text (fetched from BibleGateway) and tag it
// (RVR1960). Covers:
//   1. Spanish devotional anchor-scripture lines
//   2. Verbatim "**Reference** *– quote*" lines inside Spanish teaching prose
//      (one-line paraphrase summaries are NOT quotes and are left alone)
//   3. Structured Scripture blocks in Spanish teachings (quotation + translation)
//
// Safety: dry run by default; the current text of every row is saved to a backup
// file before anything is written; a row is skipped if it changed after this
// script read it (so an edit you are making in the admin is never overwritten).
//
// Dry run:  node --env-file=.env.local scripts/convert-spanish-quotes-to-rvr1960.mjs
// Apply:    APPLY=true node --env-file=.env.local scripts/convert-spanish-quotes-to-rvr1960.mjs

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { spanishToEnglishReference } from "./lib/spanish-books.mjs";

const APPLY = process.env.APPLY === "true";
const BACKUP_DIR = process.env.BACKUP_DIR ?? ".";
const MAX_WORDS = 60;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are required.");
const supabase = createClient(url, key);

const passageCache = new Map();
async function rvr1960Text(spanishReference) {
  const english = spanishToEnglishReference(spanishReference);
  if (!english) throw new Error(`Unknown book in reference: ${spanishReference}`);
  const searchReference = english.replace(/(\d)[a-z](?=\s*[–-])/, "$1").replace(/(\d)[a-z]$/, "$1");
  if (passageCache.has(searchReference)) return passageCache.get(searchReference);

  const res = await fetch(`https://www.biblegateway.com/passage/?search=${encodeURIComponent(searchReference)}&version=RVR1960`, { headers: { "User-Agent": "Mozilla/5.0" } });
  const html = await res.text();
  const body = (html.match(/<div class="passage-text">([\s\S]*?)<div class="(?:footnotes|publisher-info-bottom)/) ?? [])[1] ?? "";
  const text = body
    .replace(/<sup[\s\S]*?<\/sup>/g, " ")
    .replace(/<span class="(?:chapternum|versenum)[\s\S]*?<\/span>/g, " ")
    .replace(/<h3[\s\S]*?<\/h3>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#8217;|&rsquo;/g, "'")
    .replace(/&#8220;|&#8221;|&ldquo;|&rdquo;/g, '"')
    .replace(/&#\d+;/g, " ")
    .replace(/\s+/g, " ")
    // BibleGateway page furniture that follows or interrupts the verse text
    .replace(/\s+(?:Read full chapter|Cross references|Next )[\s\S]*$/, "")
    .replace(/\(\s*[^)]*\d+\.\d+[^)]*\)\s*/g, "")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim()
    .replace(/[,;:]$/, "...");
  if (!text) throw new Error(`No RVR1960 text found for ${spanishReference} (looked up "${searchReference}")`);
  passageCache.set(searchReference, text);
  await new Promise((resolve) => setTimeout(resolve, 150));
  return text;
}

// Keep the whole passage when it is short; otherwise cut at a clause boundary
// and add "..." (the existing devotional lines already quote only the opening).
function excerpt(text) {
  const words = text.split(" ");
  if (words.length <= MAX_WORDS) return { text, truncated: false };
  const cut = words.slice(0, MAX_WORDS).join(" ");
  // Prefer ending on a full sentence, then on a clause; never mid-clause.
  const sentenceEnd = cut.lastIndexOf(".");
  const clauseEnd = Math.max(cut.lastIndexOf(";"), cut.lastIndexOf(":"), cut.lastIndexOf(","));
  const boundary = sentenceEnd > cut.length * 0.4 ? sentenceEnd + 1 : clauseEnd > cut.length * 0.4 ? clauseEnd : -1;
  const base = boundary > 0 ? cut.slice(0, boundary) : cut;
  return { text: base.replace(/[.,;:\s]+$/, ""), truncated: true };
}

const changes = []; // { table, id, updatedAt, label, before, after, column, value }

// ---- 1. Spanish devotional anchor lines ----
const { data: devotionals } = await supabase.from("teaching_devotionals").select("id, title").eq("language", "es");
for (const devotional of devotionals ?? []) {
  const { data: days } = await supabase.from("teaching_devotional_days").select("id, day_number, anchor_scriptures, updated_at").eq("devotional_id", devotional.id);
  for (const day of days ?? []) {
    const lines = [];
    for (const line of day.anchor_scriptures ?? []) {
      const match = line.match(/^\s*((?:[1-3]\s)?[\p{L}]+(?:\s[\p{L}]+)*\s\d+:\d+[a-z]?(?:\s*[–-]\s*\d+(?::\d+)?[a-z]?)?)\s*(?:\([A-Za-z0-9-]+\))?\s*(:|—|–|-)\s*.+$/su);
      if (!match) throw new Error(`Cannot read reference in devotional line: ${line}`);
      const { text, truncated } = excerpt(await rvr1960Text(match[1]));
      lines.push(`${match[1].replace(/\s+/g, " ")} (RVR1960)${match[2] === ":" ? ":" : ` ${match[2]}`} «${text}${truncated ? "..." : ""}»`);
    }
    if (lines.some((value, index) => value !== day.anchor_scriptures[index])) {
      changes.push({ table: "teaching_devotional_days", id: day.id, updatedAt: day.updated_at, label: `${devotional.title} Day ${day.day_number}`, column: "anchor_scriptures", before: day.anchor_scriptures, value: lines, after: lines });
    }
  }
}

// ---- 2 + 3. Spanish teaching sections ----
const { data: teachings } = await supabase.from("teachings").select("id, slug").eq("language", "es");
for (const teaching of teachings ?? []) {
  const { data: sections } = await supabase.from("teaching_sections").select("id, title, status, content, updated_at").eq("teaching_id", teaching.id);
  for (const section of sections ?? []) {
    const content = section.content;

    if (content.format === "scripture" && content.reference) {
      const passage = await rvr1960Text(content.reference);
      if (content.quotation !== passage || content.translation !== "RVR1960") {
        const next = { ...content, quotation: passage, translation: "RVR1960" };
        changes.push({ table: "teaching_sections", id: section.id, updatedAt: section.updated_at, label: `${teaching.slug} [${section.status}] ${section.title}`, column: "content", before: content, value: next, after: { reference: content.reference, translation: "RVR1960", quotation: passage } });
      }
      continue;
    }

    if (typeof content.text === "string") {
      // Verbatim quotes are written "**Reference** *– quote*"; summaries use "- ".
      const pattern = /\*\*((?:[1-3]\s)?[\p{L}]+(?:\s[\p{L}]+)*\s\d+:\d+[a-z]?(?:[–-]\d+)?)(?:\s*\([A-Za-z0-9-]+\))?\*\*\s*\*–\s*([^*]+)\*/gu;
      let text = content.text;
      const replacements = [];
      for (const match of content.text.matchAll(pattern)) {
        const passage = await rvr1960Text(match[1]);
        replacements.push([match[0], `**${match[1]} (RVR1960)** *– ${passage}*`]);
      }
      for (const [from, to] of replacements) text = text.replace(from, to);
      if (text !== content.text) {
        changes.push({ table: "teaching_sections", id: section.id, updatedAt: section.updated_at, label: `${teaching.slug} [${section.status}] ${section.title}`, column: "content", before: content, value: { ...content, text }, after: replacements.map(([, to]) => to) });
      }
    }
  }
}

console.log(`${APPLY ? "APPLYING" : "DRY RUN"} - ${changes.length} row(s) to change\n`);
for (const change of changes) {
  console.log(`== ${change.label}`);
  console.log("   before:", JSON.stringify(change.before).slice(0, 600));
  console.log("   after: ", JSON.stringify(change.after).slice(0, 900));
  console.log("");
}

if (!APPLY) {
  console.log("Dry run only. Re-run with APPLY=true to write these changes (a backup is saved first).");
  process.exit(0);
}

const backupPath = `${BACKUP_DIR}/spanish-rvr1960-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
mkdirSync(dirname(backupPath), { recursive: true });
writeFileSync(backupPath, JSON.stringify(changes.map(({ table, id, column, before }) => ({ table, id, column, before })), null, 2));
console.log(`Backup of current text saved to ${backupPath}\n`);

for (const change of changes) {
  const { data, error } = await supabase.from(change.table).update({ [change.column]: change.value }).eq("id", change.id).eq("updated_at", change.updatedAt).select("id");
  if (error) console.log(`ERROR  ${change.label}: ${error.message}`);
  else if (!data?.length) console.log(`SKIPPED (edited since read) ${change.label}`);
  else console.log(`updated ${change.label}`);
}
