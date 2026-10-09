#!/usr/bin/env node

// Read-only verifier: for every Scripture quotation we can find on the site
// (devotional anchor lines, teaching prose quotes, shared footers, and the
// Points of Agreement guide), fetch the passage in each candidate translation
// and report which translation(s) the quoted wording actually matches. This
// exists because tagging by eye produced wrong tags (see git history).
//
//   node --env-file=.env.local scripts/verify-quote-translations.mjs

import { createClient } from "@supabase/supabase-js";
import { bookNameOf, spanishToEnglishReference } from "./lib/spanish-books.mjs";

const VERSIONS = ["NIV", "ESV", "NKJV", "KJV", "AMPC", "AMP"];
// Spanish quotes are compared against these (BibleGateway version codes).
const SPANISH_VERSIONS = ["RVR1960", "NVI", "LBLA", "NBLA", "DHH", "NTV", "RVA-2015", "TLA"];
const cache = new Map();

function normalize(text) {
  return text
    .normalize("NFC")
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”«»]/g, '"')
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^\p{L}\p{N}' ]+/gu, " ")
    // Quote marks around a phrase aren't wording (a quote may use 'single' marks
    // where the translation uses "double"); keep only apostrophes inside words.
    .replace(/(^|\s)'+/g, "$1")
    .replace(/'+(?=\s|$)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchPassage(reference, version) {
  const key = `${reference}|${version}`;
  if (cache.has(key)) return cache.get(key);
  const url = `https://www.biblegateway.com/passage/?search=${encodeURIComponent(reference)}&version=${version}`;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  const html = await res.text();
  const match = html.match(/<div class="passage-text">([\s\S]*?)<div class="(?:footnotes|publisher-info-bottom)/);
  let body = match ? match[1] : "";
  body = body
    .replace(/<sup[\s\S]*?<\/sup>/g, " ")
    .replace(/<span class="(?:chapternum|versenum)[\s\S]*?<\/span>/g, " ")
    .replace(/<h3[\s\S]*?<\/h3>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#8217;|&rsquo;/g, "'")
    .replace(/&#8220;|&#8221;|&ldquo;|&rdquo;/g, '"')
    .replace(/&#\d+;/g, " ");
  const normalized = normalize(body);
  cache.set(key, normalized);
  await new Promise((r) => setTimeout(r, 150));
  return normalized;
}

function fragmentsOf(quote) {
  return quote
    .split(/\.{3}|…/)
    .map((part) => normalize(part))
    .filter((part) => part.split(" ").length >= 3);
}

function overlap(fragments, passage) {
  let total = 0;
  let hit = 0;
  for (const fragment of fragments) {
    const words = fragment.split(" ");
    for (let i = 0; i + 4 <= words.length; i += 1) {
      total += 1;
      if (passage.includes(words.slice(i, i + 4).join(" "))) hit += 1;
    }
  }
  return total ? hit / total : 0;
}

async function matchesFor(reference, quote, versions = VERSIONS) {
  const fragments = fragmentsOf(quote);
  if (!fragments.length) return { matches: [], note: "too short to compare" };
  const matches = [];
  const scores = [];
  for (const version of versions) {
    const passage = await fetchPassage(reference, version);
    if (!passage) { scores.push([version, -1]); continue; }
    if (fragments.every((fragment) => passage.includes(fragment))) matches.push(version);
    scores.push([version, overlap(fragments, passage)]);
  }
  if (scores.every(([, score]) => score < 0)) {
    return { matches: [], closest: `NO PASSAGE FOUND for "${reference}" (lookup failed - this is not a wording mismatch)` };
  }
  scores.sort((a, b) => b[1] - a[1]);
  return { matches, best: scores[0][0], closest: scores.slice(0, 2).map(([v, sc]) => v + ":" + Math.round(sc * 100) + "%").join(" ") };
}

// Bible.com version numbers (each confirmed against the live site).
const BIBLE_COM_VERSION_IDS = { NIV: 111, ESV: 59, NKJV: 114, KJV: 1, AMPC: 8, AMP: 1588 };
const BIBLE_COM_BOOKS = {
  genesis: "GEN", exodus: "EXO", leviticus: "LEV", numbers: "NUM", deuteronomy: "DEU", joshua: "JOS", judges: "JDG", ruth: "RUT",
  "1 samuel": "1SA", "2 samuel": "2SA", "1 kings": "1KI", "2 kings": "2KI", "1 chronicles": "1CH", "2 chronicles": "2CH",
  ezra: "EZR", nehemiah: "NEH", esther: "EST", job: "JOB", psalm: "PSA", psalms: "PSA", proverbs: "PRO", ecclesiastes: "ECC",
  "song of solomon": "SNG", isaiah: "ISA", jeremiah: "JER", lamentations: "LAM", ezekiel: "EZK", daniel: "DAN", hosea: "HOS",
  joel: "JOL", amos: "AMO", obadiah: "OBA", jonah: "JON", micah: "MIC", nahum: "NAM", habakkuk: "HAB", zephaniah: "ZEP",
  haggai: "HAG", zechariah: "ZEC", malachi: "MAL", matthew: "MAT", mark: "MRK", luke: "LUK", john: "JHN", acts: "ACT",
  romans: "ROM", "1 corinthians": "1CO", "2 corinthians": "2CO", galatians: "GAL", ephesians: "EPH", philippians: "PHP",
  colossians: "COL", "1 thessalonians": "1TH", "2 thessalonians": "2TH", "1 timothy": "1TI", "2 timothy": "2TI", titus: "TIT",
  philemon: "PHM", hebrews: "HEB", james: "JAS", "1 peter": "1PE", "2 peter": "2PE", "1 john": "1JN", "2 john": "2JN",
  "3 john": "3JN", jude: "JUD", revelation: "REV",
};

function bibleComLink(reference, version) {
  const match = reference.match(/^(.+?)\s(\d+):(\d+)[a-z]?(?:\s*[–-]\s*(\d+)[a-z]?)?$/);
  const book = match && BIBLE_COM_BOOKS[match[1].toLowerCase()];
  const id = BIBLE_COM_VERSION_IDS[version];
  if (!match || !book || !id) return null;
  const verses = match[4] ? `${match[3]}-${match[4]}` : match[3];
  return `https://www.bible.com/bible/${id}/${book}.${match[2]}.${verses}.${version}`;
}

function isEnglishBook(reference) {
  const book = bookNameOf(reference);
  return Boolean(book && BIBLE_COM_BOOKS[book]);
}

const TAG_SOURCE = "AMPC|AMP|NKJV|ESV|NIV|KJV|RVR1960|NVI|LBLA|NBLA|DHH|NTV|RVA-2015|TLA";

function splitReferenceAndQuote(line) {
  // Read the reference by its book/chapter:verse shape, so a missing opening
  // quote mark (or a colon inside the quote) can't shift where it ends.
  const match = line.match(new RegExp(`^\\s*((?:[1-3]\\s)?[\\p{L}]+(?:\\s[\\p{L}]+)*\\s\\d+:\\d+[a-z]?(?:\\s*[–-]\\s*\\d+(?::\\d+)?[a-z]?)?)\\s*(?:\\((?:${TAG_SOURCE})\\))?\\s*(?::|—|–|-)\\s*(.+)$`, "su"));
  if (!match) return null;
  return {
    reference: match[1].replace(/(\d)[a-z](?=\s*[–-])/, "$1").replace(/\s+/g, " "),
    quote: match[2].replace(/^[“"'«\s]+/, "").replace(/[”"'»\s]+$/, ""),
  };
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are required.");
const supabase = createClient(url, key);

const items = [];
const problems = [];

const { data: days } = await supabase
  .from("teaching_devotional_days")
  .select("day_number, anchor_scriptures, teaching_devotionals(title)");
for (const day of days ?? []) {
  const devotional = Array.isArray(day.teaching_devotionals) ? day.teaching_devotionals[0] : day.teaching_devotionals;
  for (const line of day.anchor_scriptures ?? []) {
    const tag = line.match(new RegExp(`\\((${TAG_SOURCE})\\)`))?.[1] ?? "NONE";
    const parsed = splitReferenceAndQuote(line);
    if (!parsed) continue;
    const where = `${devotional?.title} Day ${day.day_number}`;
    if (isEnglishBook(parsed.reference)) {
      items.push({ where, tag, ...parsed });
    } else {
      const searchReference = spanishToEnglishReference(parsed.reference);
      if (searchReference) items.push({ where, tag, ...parsed, searchReference, versions: SPANISH_VERSIONS });
      else problems.push({ where, text: `unrecognized book name in "${parsed.reference}"` });
    }
  }
}

// Spanish teachings (any status): structured Scripture blocks and verbatim
// "**Reference (TAG)** *– quote*" lines inside prose. One-line summaries use a
// hyphen ("*- ...") and are paraphrases, so they are not checked.
const { data: spanishTeachings } = await supabase.from("teachings").select("id, slug").eq("language", "es");
for (const teaching of spanishTeachings ?? []) {
  const { data: sections } = await supabase.from("teaching_sections").select("title, status, content").eq("teaching_id", teaching.id);
  for (const section of sections ?? []) {
    const content = section.content ?? {};
    const where = `${teaching.slug} [${section.status}] ${section.title}`;
    const addSpanish = (reference, tag, quote) => {
      const searchReference = spanishToEnglishReference(reference);
      if (searchReference) items.push({ where, tag, reference, quote, searchReference, versions: SPANISH_VERSIONS });
      else problems.push({ where, text: `unrecognized book name in "${reference}"` });
    };
    if (content.format === "scripture" && content.reference && content.quotation) {
      addSpanish(content.reference, content.translation || "NONE", String(content.quotation).replace(/^[“"'«\s]+/, "").replace(/[”"'»\s]+$/, ""));
    }
    if (typeof content.text === "string") {
      const pattern = new RegExp(`\\*\\*((?:[1-3]\\s)?[\\p{L}]+(?:\\s[\\p{L}]+)*\\s\\d+:\\d+[a-z]?(?:[–-]\\d+)?)(?:\\s*\\((${TAG_SOURCE})\\))?\\*\\*\\s*\\*–\\s*([^*]+)\\*`, "gu");
      for (const match of content.text.matchAll(pattern)) addSpanish(match[1], match[2] ?? "NONE", match[3].trim());
    }
  }
}

items.push(
  { where: "Mission Statement footer", tag: "ESV", reference: "Matthew 18:19", quote: "Again, I say to you, if two of you agree on earth about anything they ask, it will be done for them by my Father in heaven." },
  { where: "Shuttering teaching", tag: "NKJV", reference: "James 1:17", quote: "with whom there is no variation or shadow of turning" },
  { where: "Shuttering teaching", tag: "NKJV", reference: "2 Corinthians 5:21", quote: "For He made Him who knew no sin to be sin for us, that we might become the righteousness of God in Him." },
  { where: "Shuttering teaching", tag: "NKJV", reference: "Jeremiah 23:6", quote: "In His days Judah will be saved, and Israel will dwell safely; now this is His name by which He will be called: THE LORD OUR RIGHTEOUSNESS." },
  { where: "Shuttering teaching", tag: "NKJV", reference: "Proverbs 29:2", quote: "When the righteous are in authority, the people rejoice; but when a wicked man rules, the people groan." },
);

// ---- Points of Agreement: read the live public rows (same view the page uses) ----
const REF_SOURCE = String.raw`(?:[1-3]\s)?[A-Za-z]+(?:\s[A-Za-z]+)*\s\d+:\d+[a-z]?(?:\s*[–-]\s*\d+(?::\d+)?[a-z]?)?`;
const cleanReference = (ref) => ref.replace(/(\d)[a-z](?=\s*[–-])/, "$1").replace(/\s+/g, " ").trim();
const cleanQuote = (quote) => quote.replace(/^[“"'\s*]+/, "").replace(/[”"'\s*]+$/, "");

// A scripture line is either "REF (TAG) — quote" (reference first, often bold)
// or "quote — REF (TAG)" (reference last).
function parsePointsLine(rawLine) {
  const line = rawLine.replace(/\*\*/g, "").trim();
  if (!line) return null;
  const refFirst = line.match(new RegExp(`^(${REF_SOURCE})\\s*(?:\\((${TAG_SOURCE})\\))?\\s*[—–-]+\\s*(.+)$`, "s"));
  if (refFirst) return { reference: cleanReference(refFirst[1]), tag: refFirst[2] ?? "NONE", quote: cleanQuote(refFirst[3]) };
  const refLast = line.match(new RegExp(`^(.+?)\\s*[—–-]+\\s*(${REF_SOURCE})\\s*(?:\\((${TAG_SOURCE})\\))?\\s*$`, "s"));
  if (refLast) return { reference: cleanReference(refLast[2]), tag: refLast[3] ?? "NONE", quote: cleanQuote(refLast[1]) };
  return { unparsed: line };
}

function addPointsItem(where, parsed) {
  if (!parsed) return;
  if (parsed.unparsed) problems.push({ where, text: parsed.unparsed });
  else items.push({ where, ...parsed });
}

const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!publicKey) throw new Error("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is required to read the Points of Agreement rows.");
const publicSupabase = createClient(url, publicKey);

const { data: guide, error: guideError } = await publicSupabase
  .from("public_points_of_agreement_guide_settings")
  .select("opening_scripture, opening_scripture_reference, footer_quotation, footer_scripture_reference")
  .maybeSingle();
if (guideError || !guide) {
  problems.push({ where: "Points of Agreement guide settings", text: `could not be read (${guideError?.message ?? "no row"})` });
} else {
  for (const [label, quote, referenceField] of [
    ["Points of Agreement opening quote", guide.opening_scripture, guide.opening_scripture_reference],
    ["Points of Agreement closing quote", guide.footer_quotation, guide.footer_scripture_reference],
  ]) {
    const ref = String(referenceField ?? "").match(new RegExp(`^\\s*(${REF_SOURCE})\\s*(?:\\((${TAG_SOURCE})\\))?`));
    if (!ref || !quote) problems.push({ where: label, text: `could not read a reference from "${referenceField ?? ""}"` });
    else items.push({ where: label, reference: cleanReference(ref[1]), tag: ref[2] ?? "NONE", quote: cleanQuote(String(quote)) });
  }
}

const { data: points, error: pointsError } = await publicSupabase
  .from("public_points_of_agreement")
  .select("point_of_agreement, scripture, display_order")
  .order("display_order", { ascending: true });
if (pointsError) {
  problems.push({ where: "Points of Agreement rows", text: `could not be read (${pointsError.message})` });
} else {
  (points ?? []).forEach((point, index) => {
    for (const line of String(point.scripture ?? "").split(/\r?\n/)) {
      addPointsItem(`Points of Agreement Focus ${index + 1}: ${point.point_of_agreement}`, parsePointsLine(line));
    }
  });
}

let mismatches = 0;
for (const item of items) {
  const versions = item.versions ?? VERSIONS;
  const lookupReference = item.searchReference ?? item.reference;
  const { matches, best, note, closest } = await matchesFor(lookupReference, item.quote, versions);
  const ok = item.tag !== "NONE" && matches.includes(item.tag);
  if (ok) continue;

  mismatches += 1;
  // Link to the translation it was tagged with, else the one it matched or came closest to.
  const linkVersion = versions.includes(item.tag) ? item.tag : (matches[0] ?? best);
  const link = linkVersion ? bibleComLink(lookupReference, linkVersion) : null;
  const quoteShown = item.quote.length > 140 ? `${item.quote.slice(0, 140)}...` : item.quote;
  console.log(`CHECK  [${item.where}] ${item.reference}`);
  console.log(`  tagged: ${item.tag}   exact match: ${matches.join("/") || "none"}   closest: ${closest ?? note}`);
  console.log(`  quote:  ${quoteShown}`);
  if (link) console.log(`  verify: ${link}`);
  console.log("");
}
for (const problem of problems) {
  mismatches += 1;
  console.log(`CHECK  [${problem.where}]`);
  console.log(`  could not check: ${problem.text.length > 160 ? `${problem.text.slice(0, 160)}...` : problem.text}`);
  console.log("");
}
const total = items.length + problems.length;
console.log(mismatches
  ? `${mismatches} of ${total} quotations need attention.`
  : `All ${total} quotations match their translation tags.`);
