#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const ACTIVE_STATUSES = new Set(["active", "confirmed", "subscribed", "enabled"]);
const PENDING_STATUSES = new Set(["pending", "unconfirmed", "awaiting_confirmation", "awaiting confirmation"]);
const UNSUBSCRIBED_STATUSES = new Set(["unsubscribed", "unsubscribed_from_all"]);
const SUPPRESSED_STATUSES = new Set(["bounced", "bounce", "complained", "complaint", "blocked", "suppressed", "spam"]);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseCsv(input) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    const next = input[index + 1];
    if (quoted && character === "\"" && next === "\"") {
      cell += "\"";
      index += 1;
    } else if (character === "\"") {
      quoted = !quoted;
    } else if (!quoted && character === ",") {
      row.push(cell);
      cell = "";
    } else if (!quoted && (character === "\n" || character === "\r")) {
      if (character === "\r" && next === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }

  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

function normalizeKey(value) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function rowObjects(rows) {
  const headers = rows[0]?.map(normalizeKey) ?? [];
  return rows.slice(1).map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index]?.trim() ?? ""])));
}

function value(row, names) {
  for (const name of names) {
    const found = row[normalizeKey(name)];
    if (found) return found;
  }
  return "";
}

function classify(row) {
  const rawStatus = value(row, ["status", "subscriber status", "email status", "state"]).toLowerCase();
  const rawSuppression = value(row, ["suppression status", "suppressed", "bounce type", "complaint"]).toLowerCase();
  const joined = `${rawStatus} ${rawSuppression}`;
  if ([...SUPPRESSED_STATUSES].some((status) => joined.includes(status))) return "suppressed";
  if (UNSUBSCRIBED_STATUSES.has(rawStatus)) return "unsubscribed";
  if (PENDING_STATUSES.has(rawStatus)) return "pending";
  if (ACTIVE_STATUSES.has(rawStatus)) return "active";
  return "unknown";
}

function parseTimestamp(row) {
  const raw = value(row, ["confirmed at", "confirmed_at", "confirmation date", "subscribed at", "subscribed_at"]);
  if (!raw) return null;
  const timestamp = new Date(raw);
  return Number.isNaN(timestamp.getTime()) ? null : timestamp.toISOString();
}

function fingerprint(email) {
  return createHash("sha256").update(email).digest("hex").slice(0, 12);
}

function summarize(rows) {
  const summary = { active: 0, pending: 0, unsubscribed: 0, suppressed: 0, invalid: 0, unknown: 0, duplicates: 0 };
  const seen = new Set();
  const activeRows = [];

  for (const row of rows) {
    const email = value(row, ["email", "email address"]).toLowerCase();
    if (!EMAIL_PATTERN.test(email)) {
      summary.invalid += 1;
      continue;
    }
    if (seen.has(email)) {
      summary.duplicates += 1;
      continue;
    }
    seen.add(email);

    const status = classify(row);
    summary[status] += 1;
    if (status === "active") activeRows.push({ row, email, confirmedAt: parseTimestamp(row) });
  }

  return { summary, activeRows };
}

async function upsertActiveSubscribers(activeRows) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are required.");
  const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

  for (const { row, email, confirmedAt } of activeRows) {
    const firstName = value(row, ["first name", "first_name", "name"]).split(/\s+/)[0] || "Friend";
    const subscriberPayload = {
      first_name: firstName.slice(0, 120),
      email,
      normalized_email: email,
      status: "confirmed",
      confirmed_at: confirmedAt,
      unsubscribed_at: null,
      suppressed_at: null,
      sender_contact_id: value(row, ["id", "contact id", "subscriber id"]) || null,
      sender_sync_status: "synced",
      sender_sync_error: null,
    };
    const { data: existing, error: readError } = await supabase.from("email_subscribers").select("id").eq("normalized_email", email).maybeSingle();
    if (readError) throw readError;
    const subscriberResult = existing?.id
      ? await supabase.from("email_subscribers").update(subscriberPayload).eq("id", existing.id).select("id").single()
      : await supabase.from("email_subscribers").insert(subscriberPayload).select("id").single();
    if (subscriberResult.error) throw subscriberResult.error;
    const subscriberId = subscriberResult.data.id;
    const now = new Date().toISOString();
    const preferences = [
      { subscriber_id: subscriberId, category: "weekly_updates", status: "disabled", disabled_at: now, confirmed_at: null },
      { subscriber_id: subscriberId, category: "teachings", status: "disabled", disabled_at: now, confirmed_at: null },
      { subscriber_id: subscriberId, category: "devotionals", status: "active", disabled_at: null, confirmed_at: confirmedAt },
    ];
    const { error: preferenceError } = await supabase.from("email_subscription_preferences").upsert(preferences, { onConflict: "subscriber_id,category" });
    if (preferenceError) throw preferenceError;
    const { count: existingConsentCount, error: consentReadError } = await supabase
      .from("email_consent_events")
      .select("id", { count: "exact", head: true })
      .eq("subscriber_id", subscriberId)
      .eq("event_type", "legacy_devotional_imported")
      .contains("categories", ["devotionals"]);
    if (consentReadError) throw consentReadError;
    if (!existingConsentCount) {
      const { error: consentError } = await supabase.from("email_consent_events").insert({
        subscriber_id: subscriberId,
        event_type: "legacy_devotional_imported",
        categories: ["devotionals"],
        first_name: firstName.slice(0, 120),
        normalized_email: email,
        metadata: {
          source: "sender.net",
          source_form: "existing devotional double opt-in form",
          confirmation_timestamp_available: Boolean(confirmedAt),
          email_fingerprint: fingerprint(email),
        },
      });
      if (consentError) throw consentError;
    }
  }
}

const exportPath = process.argv[2] || process.env.SENDER_DEVOTIONAL_EXPORT_CSV;
const applyImport = process.env.APPLY_IMPORT === "true";

if (!exportPath) {
  console.error("Usage: node scripts/import-sender-devotional-subscribers.mjs <sender-export.csv>");
  console.error("Default mode is dry-run. Set APPLY_IMPORT=true only after reviewing the counted status summary.");
  process.exit(1);
}

const input = await readFile(exportPath, "utf8");
const rows = rowObjects(parseCsv(input));
const { summary, activeRows } = summarize(rows);

console.log(JSON.stringify({
  mode: applyImport ? "apply" : "dry-run",
  totalRows: rows.length,
  summary,
  importableConfirmedActiveDevotionalSubscribers: activeRows.length,
  note: "No email addresses are printed. Pending, unsubscribed, bounced, complained, blocked, suppressed, invalid, duplicate, and unknown rows are not imported as active.",
}, null, 2));

if (applyImport) {
  await upsertActiveSubscribers(activeRows);
  console.log(JSON.stringify({ importedOrUpdated: activeRows.length }, null, 2));
}
