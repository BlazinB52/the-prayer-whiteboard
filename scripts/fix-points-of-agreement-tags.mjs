#!/usr/bin/env node

// One-time fix for the four Points of Agreement quotes the verifier flagged:
//   - Proverbs 29:2 was tagged (NIV) but is word-for-word NKJV
//   - Jeremiah 49:38, Luke 21:28, Exodus 14:13 had no translation tag
// Each edit targets exact existing text, is skipped if already done, and only
// writes if the row has not changed since it was read.
//
// Dry run:  node --env-file=.env.local scripts/fix-points-of-agreement-tags.mjs
// Apply:    APPLY=true node --env-file=.env.local scripts/fix-points-of-agreement-tags.mjs

import { createClient } from "@supabase/supabase-js";

const APPLY = process.env.APPLY === "true";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are required.");
const supabase = createClient(url, key);

const EDITS = [
  ["PROVERBS 29:2 (NIV)", "PROVERBS 29:2 (NKJV)"],
  ["— JEREMIAH 49:38", "— JEREMIAH 49:38 (NKJV)"],
  ["— LUKE 21:28", "— LUKE 21:28 (NKJV)"],
  ["— EXODUS 14:13", "— EXODUS 14:13 (NKJV)"],
];

const { data: rows, error } = await supabase.from("points_of_agreement").select("id, point_of_agreement, scripture, updated_at");
if (error) throw new Error(`Could not read points_of_agreement: ${error.message}`);

for (const [from, to] of EDITS) {
  const matches = rows.filter((row) => row.scripture.includes(from) && !row.scripture.includes(to));
  if (matches.length !== 1) {
    console.log(`${to}: ${matches.length === 0 ? "already done or not found" : `ambiguous (${matches.length} rows)`} - skipped`);
    continue;
  }
  const row = matches[0];
  const next = row.scripture.replace(from, to);
  console.log(`${row.point_of_agreement}\n  ${from}  ->  ${to}`);
  if (!APPLY) continue;

  const { data, error: updateError } = await supabase.from("points_of_agreement").update({ scripture: next }).eq("id", row.id).eq("updated_at", row.updated_at).select("id");
  if (updateError) console.log(`  ERROR: ${updateError.message}`);
  else if (!data?.length) console.log("  SKIPPED (row changed since it was read)");
  else {
    console.log("  updated");
    row.scripture = next;
    row.updated_at = null; // re-read before any second edit on this row
    const { data: fresh } = await supabase.from("points_of_agreement").select("updated_at").eq("id", row.id).maybeSingle();
    row.updated_at = fresh?.updated_at;
  }
}
if (!APPLY) console.log("\nDry run only. Re-run with APPLY=true to write these changes.");
