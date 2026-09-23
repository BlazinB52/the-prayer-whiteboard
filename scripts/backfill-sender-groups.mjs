#!/usr/bin/env node

// Backfills confirmed subscribers into their Weekly Updates / Teachings /
// Devotionals Sender groups. None of the three were reliably synced before
// the "sync every confirmed category" fix (149c973, 2026-09-21) landed, and
// the Sender devotional group id env vars weren't even set in Production
// until that same day — so any subscriber confirmed before then can exist in
// Supabase with an active preference but in no matching Sender group.
//
// This is safe to re-run: Sender group adds are additive (POST
// /subscribers/groups/{id}), so re-adding an already-member subscriber is a
// harmless no-op and never removes them from any other group.
//
// Dry run:  node --env-file=.env.local scripts/backfill-sender-groups.mjs
// Apply:    APPLY_BACKFILL=true node --env-file=.env.local scripts/backfill-sender-groups.mjs

import { createClient } from "@supabase/supabase-js";
import { getSenderGroupIdsForCategories } from "../lib/devotional-sender-groups.ts";
import { syncSenderSubscriberGroups } from "../lib/sender-subscriber-groups-core.ts";

const BACKFILL_CATEGORIES = ["weekly_updates", "teachings", "devotionals"];
const PAGE_SIZE = 100;
const THROTTLE_MS = 250;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
const apiKey = process.env.SENDER_API_KEY;
if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are required.");
if (!apiKey) throw new Error("SENDER_API_KEY is required.");

const applyBackfill = process.env.APPLY_BACKFILL === "true";

// Fail before touching anything if the group ids are not configured, otherwise
// every sync would be a silent no-op.
for (const category of BACKFILL_CATEGORIES) {
  if (!getSenderGroupIdsForCategories([category]).length) {
    throw new Error(`No Sender group id configured for "${category}". Set the matching SENDER_*_GROUP_ID variable.`);
  }
}

const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

function maskEmail(email) {
  const [name = "", domain = ""] = email.split("@");
  if (!domain) return "invalid-email";
  const visible = name.slice(0, Math.min(2, name.length));
  return `${visible}${"*".repeat(Math.max(2, name.length - visible.length))}@${domain}`;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function loadCandidates() {
  const candidates = [];
  for (let page = 0; ; page += 1) {
    const from = page * PAGE_SIZE;
    const { data: subscribers, error } = await supabase
      .from("email_subscribers")
      .select("id, first_name, email, status")
      .eq("status", "confirmed")
      .order("created_at", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`Subscriber lookup failed: ${error.message}`);
    if (!subscribers?.length) break;

    const { data: preferences, error: preferenceError } = await supabase
      .from("email_subscription_preferences")
      .select("subscriber_id, category")
      .in("subscriber_id", subscribers.map((subscriber) => subscriber.id))
      .in("category", BACKFILL_CATEGORIES)
      .eq("status", "active");
    if (preferenceError) throw new Error(`Preference lookup failed: ${preferenceError.message}`);

    const categoriesBySubscriber = new Map();
    for (const preference of preferences ?? []) {
      const current = categoriesBySubscriber.get(preference.subscriber_id) ?? [];
      current.push(preference.category);
      categoriesBySubscriber.set(preference.subscriber_id, current);
    }

    for (const subscriber of subscribers) {
      const categories = categoriesBySubscriber.get(subscriber.id);
      if (categories?.length) candidates.push({ ...subscriber, categories });
    }

    if (subscribers.length < PAGE_SIZE) break;
  }
  return candidates;
}

async function recordFailure(subscriber, groupIds, message) {
  await supabase.from("email_subscribers").update({
    sender_sync_status: "failed",
    sender_sync_error: message.slice(0, 300),
  }).eq("id", subscriber.id);
  await supabase.from("email_delivery_events").insert({
    subscriber_id: subscriber.id,
    provider: "sender",
    message_type: "preference_sync",
    status: "failed",
    error: message.slice(0, 300),
    metadata: { categories: subscriber.categories, groupIds, source: "backfill" },
  });
}

async function recordSuccess(subscriber, senderSubscriberId) {
  await supabase.from("email_subscribers").update({
    ...(senderSubscriberId ? { sender_contact_id: senderSubscriberId } : {}),
    sender_sync_status: "synced",
    sender_sync_error: null,
  }).eq("id", subscriber.id);
}

const candidates = await loadCandidates();
console.log(`Found ${candidates.length} confirmed subscriber(s) with Weekly Updates or Teachings active.`);
if (!applyBackfill) console.log("DRY RUN — no Sender or Supabase writes. Set APPLY_BACKFILL=true to apply.\n");

let synced = 0;
let failed = 0;
const failures = [];

for (const [index, subscriber] of candidates.entries()) {
  const groupIds = getSenderGroupIdsForCategories(subscriber.categories);
  const position = `[${index + 1}/${candidates.length}]`;
  const label = `${maskEmail(subscriber.email)} (${subscriber.id})`;

  if (!applyBackfill) {
    console.log(`${position} would sync ${label} -> ${groupIds.join(", ")} [${subscriber.categories.join(", ")}]`);
    continue;
  }

  console.log(`${position} Processing ${label} -> ${groupIds.join(", ")}`);
  try {
    const result = await syncSenderSubscriberGroups({
      apiKey,
      email: subscriber.email,
      firstName: subscriber.first_name,
      groupIds,
    });

    if (result.ok) {
      await recordSuccess(subscriber, result.subscriberId);
      synced += 1;
      console.log(`${position}   synced`);
    } else {
      await recordFailure(subscriber, groupIds, result.error);
      failed += 1;
      failures.push({ id: subscriber.id, email: maskEmail(subscriber.email), error: result.error });
      console.warn(`${position}   FAILED: ${result.error}`);
    }
  } catch (error) {
    // An unexpected throw must not abandon the remaining subscribers.
    const message = error instanceof Error ? error.message : "Unknown backfill error.";
    await recordFailure(subscriber, groupIds, message).catch(() => {});
    failed += 1;
    failures.push({ id: subscriber.id, email: maskEmail(subscriber.email), error: message });
    console.warn(`${position}   FAILED: ${message}`);
  }

  await sleep(THROTTLE_MS);
}

if (!applyBackfill) {
  console.log(`\nDry run complete. ${candidates.length} subscriber(s) would be synced.`);
} else {
  console.log(`\nSuccessfully synced ${synced} subscriber(s). ${failed} failure(s).`);
  if (failures.length) {
    console.log("\nFailures:");
    for (const failure of failures) console.log(`  ${failure.email} (${failure.id}): ${failure.error}`);
    console.log("\nFailed rows are recorded in email_delivery_events as preference_sync/failed.");
    process.exitCode = 1;
  }
}
