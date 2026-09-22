import "server-only";

import { buildDevotionalDayEmail } from "@/lib/devotional-email-content";
import { siteUrl } from "@/lib/email-subscriptions";
import { sendSenderTransactionalEmail } from "@/lib/sender-transactional";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

const SEND_INTERVAL_HOURS = 20;
const THROTTLE_MS = 150;
// Bounded so a run cannot exceed the function timeout; the next run drains more.
const MAX_PER_RUN = 40;

export type DevotionalRunSummary = {
  due: number;
  sent: number;
  failed: number;
  completed: number;
  paused: number;
  skipped: number;
};

type Enrollment = {
  id: string;
  subscriber_id: string;
  series_slug: string;
  current_day: number;
  email_subscribers: { id: string; first_name: string; email: string; status: string } | null;
};

type SeriesContent = {
  devotionalId: string;
  teachingSlug: string;
  totalDays: number;
};

function getClient() {
  const supabase = createServiceRoleClient();
  if (!supabase) throw new Error("Devotional send storage is not configured.");
  return supabase;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function loadDueEnrollments(): Promise<Enrollment[]> {
  const supabase = getClient();
  const cutoff = new Date(Date.now() - SEND_INTERVAL_HOURS * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("email_devotional_enrollments")
    .select("id, subscriber_id, series_slug, current_day, email_subscribers!inner(id, first_name, email, status)")
    .eq("status", "active")
    .or(`last_sent_at.is.null,last_sent_at.lt.${cutoff}`)
    .order("last_sent_at", { ascending: true, nullsFirst: true })
    .limit(MAX_PER_RUN);
  if (error) throw new Error(`Due enrollment lookup failed: ${error.message}`);
  return (data ?? []) as unknown as Enrollment[];
}

// Cached per run so a series shared by many subscribers is resolved once.
async function loadSeriesContent(seriesSlug: string, cache: Map<string, SeriesContent | null>) {
  if (cache.has(seriesSlug)) return cache.get(seriesSlug) ?? null;

  const supabase = getClient();
  const { data: devotional } = await supabase
    .from("teaching_devotionals")
    .select("id, teaching_id, status")
    .eq("slug", seriesSlug)
    .eq("status", "published")
    .maybeSingle();
  if (!devotional) {
    cache.set(seriesSlug, null);
    return null;
  }

  const [{ data: teaching }, { count }] = await Promise.all([
    supabase.from("teachings").select("slug").eq("id", devotional.teaching_id).maybeSingle(),
    supabase.from("teaching_devotional_days").select("id", { count: "exact", head: true }).eq("devotional_id", devotional.id),
  ]);
  if (!teaching?.slug || !count) {
    cache.set(seriesSlug, null);
    return null;
  }

  const content: SeriesContent = { devotionalId: devotional.id, teachingSlug: teaching.slug, totalDays: count };
  cache.set(seriesSlug, content);
  return content;
}

export async function processDevotionalQueue(): Promise<DevotionalRunSummary> {
  const supabase = getClient();
  const enrollments = await loadDueEnrollments();
  const summary: DevotionalRunSummary = { due: enrollments.length, sent: 0, failed: 0, completed: 0, paused: 0, skipped: 0 };
  const seriesCache = new Map<string, SeriesContent | null>();
  const base = siteUrl();
  const preferencesUrl = `${base}/email-preferences`;

  for (const enrollment of enrollments) {
    const subscriber = enrollment.email_subscribers;

    // An unsubscribed or suppressed subscriber must stop receiving days.
    if (!subscriber || subscriber.status !== "confirmed") {
      await supabase.from("email_devotional_enrollments").update({ status: "paused" }).eq("id", enrollment.id);
      summary.paused += 1;
      continue;
    }

    const series = await loadSeriesContent(enrollment.series_slug, seriesCache);
    if (!series) {
      summary.skipped += 1;
      continue;
    }

    if (enrollment.current_day > series.totalDays) {
      await supabase.from("email_devotional_enrollments").update({ status: "completed" }).eq("id", enrollment.id);
      summary.completed += 1;
      continue;
    }

    const { data: day } = await supabase
      .from("teaching_devotional_days")
      .select("day_number, title, anchor_scriptures, devotional_reading")
      .eq("devotional_id", series.devotionalId)
      .eq("day_number", enrollment.current_day)
      .maybeSingle();
    if (!day) {
      summary.skipped += 1;
      continue;
    }

    const email = buildDevotionalDayEmail({
      dayNumber: day.day_number,
      totalDays: series.totalDays,
      title: day.title,
      anchorScriptures: day.anchor_scriptures ?? [],
      devotionalReading: day.devotional_reading,
      dayUrl: `${base}/teachings/${series.teachingSlug}/devotional/day/${day.day_number}`,
      preferencesUrl,
    });

    let ok = false;
    try {
      const result = await sendSenderTransactionalEmail({
        toEmail: subscriber.email,
        toName: subscriber.first_name,
        subject: email.subject,
        html: email.html,
        text: email.text,
      });
      ok = result.ok;
    } catch {
      // One bad recipient must not abandon the rest of the queue.
      ok = false;
    }

    if (ok) {
      const nextDay = enrollment.current_day + 1;
      await supabase.from("email_devotional_enrollments").update({
        current_day: nextDay,
        last_sent_at: new Date().toISOString(),
        status: nextDay > series.totalDays ? "completed" : "active",
      }).eq("id", enrollment.id);
      summary.sent += 1;
      if (nextDay > series.totalDays) summary.completed += 1;
    } else {
      // current_day is not advanced, so the same day is retried on the next run
      // rather than skipped. last_sent_at moves so the retry waits a full cycle.
      await supabase.from("email_devotional_enrollments")
        .update({ last_sent_at: new Date().toISOString() })
        .eq("id", enrollment.id);
      summary.failed += 1;
    }

    await sleep(THROTTLE_MS);
  }

  return summary;
}
