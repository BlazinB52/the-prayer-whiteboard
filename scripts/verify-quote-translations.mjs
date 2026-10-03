#!/usr/bin/env node

// Read-only verifier: for every Scripture quotation we can find on the site
// (devotional anchor lines, teaching prose quotes, shared footers, and the
// Points of Agreement guide), fetch the passage in each candidate translation
// and report which translation(s) the quoted wording actually matches. This
// exists because tagging by eye produced wrong tags (see git history).
//
//   node --env-file=.env.local scripts/verify-quote-translations.mjs

import { createClient } from "@supabase/supabase-js";

const VERSIONS = ["NIV", "ESV", "NKJV", "KJV", "AMPC", "AMP"];
const cache = new Map();

function normalize(text) {
  return text
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9' ]+/g, " ")
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

async function matchesFor(reference, quote) {
  const fragments = fragmentsOf(quote);
  if (!fragments.length) return { matches: [], note: "too short to compare" };
  const matches = [];
  const scores = [];
  for (const version of VERSIONS) {
    const passage = await fetchPassage(reference, version);
    if (!passage) { scores.push([version, -1]); continue; }
    if (fragments.every((fragment) => passage.includes(fragment))) matches.push(version);
    scores.push([version, overlap(fragments, passage)]);
  }
  if (scores.every(([, score]) => score < 0)) {
    return { matches: [], closest: `NO PASSAGE FOUND for "${reference}" (lookup failed - this is not a wording mismatch)` };
  }
  scores.sort((a, b) => b[1] - a[1]);
  return { matches, closest: scores.slice(0, 2).map(([v, sc]) => v + ":" + Math.round(sc * 100) + "%").join(" ") };
}

function splitReferenceAndQuote(line) {
  // Read the reference by its book/chapter:verse shape, so a missing opening
  // quote mark (or a colon inside the quote) can't shift where it ends.
  const match = line.match(/^\s*((?:[1-3]\s)?[A-Za-z]+(?:\s[A-Za-z]+)*\s\d+:\d+[a-z]?(?:\s*[–-]\s*\d+(?::\d+)?[a-z]?)?)\s*(?:\((?:AMPC|AMP|NKJV|ESV|NIV|KJV)\))?\s*(?::|—|–|-)\s*(.+)$/s);
  if (!match) return null;
  return {
    reference: match[1].replace(/(\d)[a-z](?=\s*[–-])/, "$1").replace(/\s+/g, " "),
    quote: match[2].replace(/^[“"'\s]+/, "").replace(/[”"'\s]+$/, ""),
  };
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are required.");
const supabase = createClient(url, key);

const items = [];

const { data: days } = await supabase
  .from("teaching_devotional_days")
  .select("day_number, anchor_scriptures, teaching_devotionals(title)");
for (const day of days ?? []) {
  const devotional = Array.isArray(day.teaching_devotionals) ? day.teaching_devotionals[0] : day.teaching_devotionals;
  for (const line of day.anchor_scriptures ?? []) {
    const tag = line.match(/\((AMPC|AMP|NKJV|ESV|NIV|KJV)\)/)?.[1] ?? "NONE";
    const parsed = splitReferenceAndQuote(line);
    if (parsed) items.push({ where: `${devotional?.title} Day ${day.day_number}`, tag, ...parsed });
  }
}

items.push(
  { where: "Mission Statement footer", tag: "NKJV", reference: "Matthew 18:19", quote: "Again, I say to you, if two of you agree on earth about anything they ask, it will be done for them by my Father in heaven." },
  { where: "Shuttering teaching", tag: "NKJV", reference: "James 1:17", quote: "with whom there is no variation or shadow of turning" },
  { where: "Shuttering teaching", tag: "NKJV", reference: "2 Corinthians 5:21", quote: "For He made Him who knew no sin to be sin for us, that we might become the righteousness of God in Him." },
  { where: "Shuttering teaching", tag: "NKJV", reference: "Jeremiah 23:6", quote: "In His days Judah will be saved, and Israel will dwell safely; now this is His name by which He will be called: THE LORD OUR RIGHTEOUSNESS." },
  { where: "Shuttering teaching", tag: "NKJV", reference: "Proverbs 29:2", quote: "When the righteous are in authority, the people rejoice; but when a wicked man rules, the people groan." },
  { where: "Points of Agreement", tag: "NONE", reference: "Ephesians 6:17-18", quote: "Take the helmet of salvation and the sword of the Spirit, which is the word of God. Praying in the Spirit always..." },
  { where: "Points of Agreement", tag: "NONE", reference: "2 Chronicles 20:15-17", quote: "Be not afraid or dismayed at this great multitude, for the battle is not yours, but God's... Take our positions, stand still, and see the deliverance of the Lord..." },
  { where: "Points of Agreement", tag: "NONE", reference: "Psalm 33:12", quote: "Blessed is the nation whose God is the Lord..." },
  { where: "Points of Agreement", tag: "NONE", reference: "Proverbs 29:2", quote: "When the righteous rule, the people rejoice..." },
  { where: "Points of Agreement", tag: "NONE", reference: "Jeremiah 49:38", quote: "I will set My throne in Elam" },
  { where: "Points of Agreement", tag: "NONE", reference: "Luke 21:28", quote: "When these things begin to happen, look up and lift up your heads, because your redemption draws near." },
  { where: "Points of Agreement", tag: "NONE", reference: "Exodus 14:13", quote: "Stand still and see the salvation of the Lord... The Egyptians whom you see today, you shall see again no more forever." },
  { where: "Points of Agreement", tag: "NONE", reference: "Matthew 18:19", quote: "Again I say to you, if two of you agree on earth about anything they ask, it will be done for them by my Father in heaven." },
);

let mismatches = 0;
for (const item of items) {
  const { matches, note, closest } = await matchesFor(item.reference, item.quote);
  const ok = item.tag !== "NONE" && matches.includes(item.tag);
  if (!ok) mismatches += 1;
  console.log(`${ok ? "OK      " : "CHECK   "} [${item.where}] ${item.reference} tagged=${item.tag} matches=${matches.join("/") || "none"} closest=${closest ?? note}`);
}
console.log(`\n${items.length} quotations checked, ${mismatches} need attention.`);
