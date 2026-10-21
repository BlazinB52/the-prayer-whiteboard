import "server-only";

import { loadConfirmedRecipients } from "@/lib/broadcast-recipients";
import type { EmailCategory } from "@/lib/email-categories";
import { maskEmail } from "@/lib/email-subscriptions";
import { getSpanishDevotionalIds } from "@/lib/spanish-devotionals";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

const WINDOW_DAYS = 7;

export type MissedRecipient = { firstName: string; email: string; reason: string };
export type SendReportRow = {
  kind: "Weekly update" | "Teaching" | "Devotional";
  title: string;
  language: "en" | "es";
  sentAt: string;
  status: string;
  expected: number;
  delivered: number;
  missed: MissedRecipient[];
  // A published teaching whose announcement email was never started, so there is nobody to list as missed.
  notSent?: boolean;
};

type Ledger = { kind: SendReportRow["kind"]; category: EmailCategory; title: string; language: "en" | "es"; sentAt: string; status: string; deliveries: { subscriber_id: string; status: string; reason: string | null }[] };

function getClient() {
  const supabase = createServiceRoleClient();
  if (!supabase) throw new Error("Send storage is not configured.");
  return supabase;
}

async function deliveriesFor(table: "email_broadcast_deliveries" | "email_send_deliveries", match: Record<string, string>) {
  const supabase = getClient();
  const rows: Ledger["deliveries"] = [];
  for (let from = 0; ; from += 1000) {
    let query = supabase.from(table).select("subscriber_id, status, reason");
    for (const [column, value] of Object.entries(match)) query = query.eq(column, value);
    const { data, error } = await query.range(from, from + 999);
    if (error) throw new Error(`Delivery lookup failed: ${error.message}`);
    rows.push(...((data ?? []) as Ledger["deliveries"]));
    if ((data?.length ?? 0) < 1000) break;
  }
  return rows;
}

// Everything mailed in the last seven days (weekly updates, teachings, devotional days) with who should have
// received it and has no 'sent' record. "Should have" is whoever is confirmed and subscribed to that category in
// that language today and had already confirmed when the send ran, so people who joined later are not counted.
export async function buildSendReport(now = new Date()): Promise<SendReportRow[]> {
  const supabase = getClient();
  const since = new Date(now.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const [weekly, teaching, devotional, spanishIds] = await Promise.all([
    supabase.from("email_broadcast_events").select("weekly_update_id, status, created_at, recipient_count").gte("created_at", since),
    supabase.from("email_teaching_broadcast_events").select("id, teaching_id, status, created_at, recipient_count").gte("created_at", since),
    supabase.from("email_devotional_broadcast_ledger").select("id, day_number, status, created_at, devotional_id, recipient_count").gte("created_at", since),
    getSpanishDevotionalIds(supabase),
  ]);
  for (const result of [weekly, teaching, devotional]) if (result.error) throw new Error(`Send history lookup failed: ${result.error.message}`);

  // Titles and languages are looked up separately rather than joined, so a missing relationship cannot break the report.
  const titlesOf = async (table: string, ids: string[], columns: string) => {
    const found = new Map<string, Record<string, string>>();
    if (ids.length) {
      const { data, error } = await supabase.from(table).select(columns).in("id", ids);
      if (error) throw new Error(`Title lookup failed: ${error.message}`);
      for (const row of (data ?? []) as unknown as Record<string, string>[]) found.set(row.id, row);
    }
    return found;
  };
  const weeklyTitles = await titlesOf("weekly_updates", (weekly.data ?? []).map((row) => row.weekly_update_id as string), "id, title, language");
  const teachingTitles = await titlesOf("teachings", (teaching.data ?? []).map((row) => row.teaching_id as string), "id, title, language");
  const devotionalTitles = await titlesOf("teaching_devotionals", (devotional.data ?? []).map((row) => row.devotional_id as string).filter(Boolean), "id, title");

  // A ledger row with no recipients mailed nobody (for example a series marked as already sent), so nobody is owed it.
  const mailed = <T extends { recipient_count: number }>(rows: T[] | null) => (rows ?? []).filter((row) => row.recipient_count > 0);
  const ledgers: Ledger[] = [];
  for (const row of mailed(weekly.data as { recipient_count: number }[] | null) as unknown as { weekly_update_id: string; status: string; created_at: string}[]) {
    ledgers.push({ kind: "Weekly update", category: "weekly_updates", title: weeklyTitles.get(row.weekly_update_id)?.title ?? "Weekly update", language: weeklyTitles.get(row.weekly_update_id)?.language === "es" ? "es" : "en", sentAt: row.created_at, status: row.status, deliveries: await deliveriesFor("email_broadcast_deliveries", { weekly_update_id: row.weekly_update_id }) });
  }
  for (const row of mailed(teaching.data as { recipient_count: number }[] | null) as unknown as { id: string; status: string; created_at: string; teaching_id: string }[]) {
    ledgers.push({ kind: "Teaching", category: "teachings", title: teachingTitles.get(row.teaching_id)?.title ?? "Teaching", language: teachingTitles.get(row.teaching_id)?.language === "es" ? "es" : "en", sentAt: row.created_at, status: row.status, deliveries: await deliveriesFor("email_send_deliveries", { kind: "teaching", ledger_id: row.id }) });
  }
  for (const row of mailed(devotional.data as { recipient_count: number }[] | null) as unknown as { id: string; day_number: number; status: string; created_at: string; devotional_id: string | null}[]) {
    ledgers.push({ kind: "Devotional", category: "devotionals", title: `${(row.devotional_id ? devotionalTitles.get(row.devotional_id)?.title : undefined) ?? "Devotional"} (day ${row.day_number})`, language: row.devotional_id && spanishIds.has(row.devotional_id) ? "es" : "en", sentAt: row.created_at, status: row.status, deliveries: await deliveriesFor("email_send_deliveries", { kind: "devotional", ledger_id: row.id }) });
  }

  // Who is subscribed now, once per category and language, plus when each person confirmed.
  const recipientCache = new Map<string, Awaited<ReturnType<typeof loadConfirmedRecipients>>>();
  const recipientsFor = async (category: EmailCategory, language: "en" | "es") => {
    const key = `${category}:${language}`;
    if (!recipientCache.has(key)) recipientCache.set(key, await loadConfirmedRecipients(category, language));
    return recipientCache.get(key)!;
  };
  const { data: confirmedRows, error: confirmedError } = await supabase.from("email_subscribers").select("id, confirmed_at").eq("status", "confirmed");
  if (confirmedError) throw new Error(`Subscriber lookup failed: ${confirmedError.message}`);
  const confirmedAt = new Map((confirmedRows ?? []).map((row) => [row.id as string, row.confirmed_at as string | null]));

  const report: SendReportRow[] = [];
  for (const ledger of ledgers) {
    const recipients = (await recipientsFor(ledger.category, ledger.language)).filter((recipient) => {
      const confirmed = confirmedAt.get(recipient.id);
      return !confirmed || confirmed <= ledger.sentAt;
    });
    const byId = new Map(ledger.deliveries.map((delivery) => [delivery.subscriber_id, delivery]));
    const missed: MissedRecipient[] = [];
    let delivered = 0;
    for (const recipient of recipients) {
      const delivery = byId.get(recipient.id);
      if (delivery?.status === "sent") { delivered += 1; continue; }
      const reason = !delivery ? "No send attempted" : delivery.status === "failed" ? `Failed${delivery.reason ? `: ${delivery.reason}` : ""}` : "Still sending";
      missed.push({ firstName: recipient.firstName, email: maskEmail(recipient.email), reason });
    }
    report.push({ kind: ledger.kind, title: ledger.title, language: ledger.language, sentAt: ledger.sentAt, status: ledger.status, expected: recipients.length, delivered, missed });
  }
  // Teaching emails are started by hand from the teaching's page, so a published English teaching can
  // simply never get one. English and Español teachings are both emailed.
  const mailedTeachingIds = new Set((teaching.data ?? []).map((row) => row.teaching_id as string));
  const { data: published, error: publishedError } = await supabase.from("teachings").select("id, title, language, published_at").eq("status", "published").in("language", ["en", "es"]).gte("published_at", since);
  if (publishedError) throw new Error(`Teaching lookup failed: ${publishedError.message}`);
  const unmailed = (published ?? []).filter((row) => !mailedTeachingIds.has(row.id as string));
  if (unmailed.length) {
    // Anything older than the 7 day window may have been mailed before it, so ask the ledger directly.
    const { data: ever } = await supabase.from("email_teaching_broadcast_events").select("teaching_id").in("teaching_id", unmailed.map((row) => row.id as string));
    const everMailed = new Set((ever ?? []).map((row) => row.teaching_id as string));
        for (const row of unmailed) {
      if (everMailed.has(row.id as string)) continue;
      const language = row.language === "es" ? "es" : "en";
      const expected = (await recipientsFor("teachings", language)).length;
      report.push({ kind: "Teaching", title: row.title as string, language, sentAt: row.published_at as string, status: "email never sent", expected, delivered: 0, missed: [], notSent: true });
    }
  }
  return report.sort((a, b) => b.sentAt.localeCompare(a.sentAt));
}
