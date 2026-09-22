#!/usr/bin/env node

// Dumps recent email_delivery_events so Sender rejection/network diagnostics are
// readable without opening the Supabase dashboard.
// Usage: node --env-file=.env.local scripts/check-email-delivery.mjs [limit]

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are required.");

const limit = Number.parseInt(process.argv[2] ?? "20", 10) || 20;
const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

const { data, error } = await supabase
  .from("email_delivery_events")
  .select("created_at, message_type, status, provider_message_id, error, metadata, subscriber_id")
  .order("created_at", { ascending: false })
  .limit(limit);
if (error) throw new Error(`Delivery events could not be read: ${error.message}`);

if (!data.length) {
  console.log("No delivery events recorded.");
} else {
  for (const event of data) {
    console.log(`\n${event.created_at}  ${event.message_type}  ${event.status}`);
    if (event.provider_message_id) console.log(`  providerMessageId: ${event.provider_message_id}`);
    if (event.error) console.log(`  error: ${event.error}`);
    const diagnostic = event.metadata?.senderDiagnostic;
    if (diagnostic) console.log(`  senderDiagnostic: ${JSON.stringify(diagnostic)}`);
  }
}

const { data: counts } = await supabase
  .from("email_delivery_events")
  .select("status")
  .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());
const tally = {};
for (const row of counts ?? []) tally[row.status] = (tally[row.status] ?? 0) + 1;
console.log(`\nLast 7 days by status: ${JSON.stringify(tally)}`);
