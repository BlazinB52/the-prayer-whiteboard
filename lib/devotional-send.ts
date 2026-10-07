import "server-only";

import { getEmailCopyrightDisclaimer } from "@/lib/copyright-disclaimers";
import { loadConfirmedRecipients } from "@/lib/broadcast-recipients";
import { buildDevotionalDayEmail, devotionalDayUrl } from "@/lib/devotional-email-content";
import { devotionalDayForWeekday, devotionalTimeZone } from "@/lib/devotional-schedule";
import { siteUrl } from "@/lib/email-subscriptions";
import { deliverToRecipients } from "@/lib/send-deliveries";
import { getSpanishDevotionalIds } from "@/lib/spanish-devotionals";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

const THROTTLE_MS = 150;

export type DevotionalRunResult =
  | { status: "no_devotional" }
  | { status: "outside_window" }
  | { status: "no_day_content"; dayNumber: number }
  | { status: "duplicate"; dayNumber: number }
  | { status: "no_broadcast" }
  | { status: "already_complete" }
  | { status: "sent" | "failed" | "incomplete"; ledgerId: string; dayNumber: number; recipientCount: number; sentCount: number; failedCount: number; remainingCount: number };

function getClient() {
  const supabase = createServiceRoleClient();
  if (!supabase) throw new Error("Devotional send storage is not configured.");
  return supabase;
}

// Claiming the ledger row first is the idempotency guard: the unique
// (devotional_id, day_number) index rejects a second blast for the same day of
// the same series. The teaching is recorded alongside it as context only.
async function claimDay(devotionalId: string, dayNumber: number, teachingId: string | null) {
  const supabase = getClient();
  const { data, error } = await supabase
    .from("email_devotional_broadcast_ledger")
    .insert({ devotional_id: devotionalId, teaching_id: teachingId, day_number: dayNumber, status: "sending" })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") return null;
    throw new Error(`Devotional day could not be claimed: ${error.message}`);
  }
  return data.id as string;
}

// Nothing in the send depends on a teaching any more. The ledger is keyed on
// the series, the day URL is built from the series slug, and since
// 20260923020000 a published series is publicly readable on its own. This
// lookup only supplies the teaching recorded alongside the ledger row as
// historical context, and returns null for a standalone series.
async function resolveAssignedTeaching(devotionalId: string) {
  const supabase = getClient();
  const { data: assignments } = await supabase
    .from("teaching_devotional_assignments")
    .select("teaching_id")
    .eq("devotional_id", devotionalId)
    .order("created_at", { ascending: true });

  const teachingIds = (assignments ?? []).map((assignment) => assignment.teaching_id);
  if (!teachingIds.length) return null;

  const { data: teachings } = await supabase
    .from("teachings")
    .select("id, slug, status")
    .eq("status", "published")
    .in("id", teachingIds);

  // Keep assignment order so a shared series always mails the same teaching.
  for (const teachingId of teachingIds) {
    const teaching = (teachings ?? []).find((item) => item.id === teachingId);
    if (teaching) return teaching;
  }
  return null;
}

const DAY_COLUMNS = "day_number, title, anchor_scriptures, devotional_reading, confession, journal_prompt, prayer_activation";

type DayContent = {
  day_number: number;
  title: string;
  anchor_scriptures: string[] | null;
  devotional_reading: string;
  confession: string;
  journal_prompt: string;
  prayer_activation: string;
};

export async function processDevotionalQueue(now = new Date()): Promise<DevotionalRunResult> {
  const supabase = getClient();

  // The most recently published series drives the run. It is read straight off
  // teaching_devotionals, so a series authored standalone is eligible on the
  // same terms as one that started life inside a teaching.
  // Español series are never mailed: the subscriber list is English, so they are skipped here.
  const { data: candidates, error: devotionalError } = await supabase
    .from("teaching_devotionals")
    .select("id, slug, title, status, published_at, updated_at")
    .eq("status", "published")
    .order("published_at", { ascending: false, nullsFirst: false })
    .order("updated_at", { ascending: false })
    .limit(25);
  if (devotionalError) throw new Error(`Devotional lookup failed: ${devotionalError.message}`);
  const spanishIds = await getSpanishDevotionalIds(supabase);
  const devotional = (candidates ?? []).find((candidate) => !spanishIds.has(candidate.id));
  if (!devotional) return { status: "no_devotional" };

  const { count: totalDays } = await supabase
    .from("teaching_devotional_days")
    .select("id", { count: "exact", head: true })
    .eq("devotional_id", devotional.id);
  if (!totalDays) return { status: "no_devotional" };

  // Today's weekday alone decides the day number.
  const dayNumber = devotionalDayForWeekday({
    now,
    totalDays,
    timeZone: devotionalTimeZone(),
  });
  if (!dayNumber) return { status: "outside_window" };

  const { data: day } = await supabase
    .from("teaching_devotional_days")
    .select(DAY_COLUMNS)
    .eq("devotional_id", devotional.id)
    .eq("day_number", dayNumber)
    .maybeSingle();
  if (!day) return { status: "no_day_content", dayNumber };

  const teaching = await resolveAssignedTeaching(devotional.id);
  const ledgerId = await claimDay(devotional.id, dayNumber, teaching?.id ?? null);
  if (!ledgerId) return { status: "duplicate", dayNumber };

  return deliverDay({ ledgerId, devotional, day: day as DayContent, dayNumber, totalDays, teaching });
}

// Mails every confirmed recipient who has no 'sent' delivery for this day yet, stopping when the time
// budget is spent. Safe to call repeatedly: finished recipients are skipped, so a resume never double-sends.
async function deliverDay(input: {
  ledgerId: string;
  devotional: { id: string; slug: string; title: string };
  day: DayContent;
  dayNumber: number;
  totalDays: number;
  teaching: { slug: string } | null;
}): Promise<DevotionalRunResult> {
  const supabase = getClient();
  const { ledgerId, devotional, day, dayNumber, totalDays, teaching } = input;

  const recipients = await loadConfirmedRecipients("devotionals");

  const base = siteUrl();
  // The email reads through to the assigned teaching when there is one, since
  // that is the fuller page for this devotional's content; a standalone series
  // has no teaching page, so it falls back to the devotional's own day URL.
  const readUrl = teaching ? `${base}/teachings/${teaching.slug}` : devotionalDayUrl(base, devotional.slug, dayNumber);
  const preferencesUrl = `${base}/email-preferences`;
  const copyrightDisclaimer = await getEmailCopyrightDisclaimer(base);

  const run = await deliverToRecipients({
    kind: "devotional",
    ledgerId,
    recipients,
    throttleMs: THROTTLE_MS,
    buildEmail: () => buildDevotionalDayEmail({
      dayNumber: day.day_number,
      totalDays,
      title: day.title,
      seriesTitle: devotional.title,
      anchorScriptures: day.anchor_scriptures ?? [],
      devotionalReading: day.devotional_reading,
      confession: day.confession,
      journalPrompt: day.journal_prompt,
      prayerActivation: day.prayer_activation,
      readUrl,
      preferencesUrl,
      copyrightDisclaimer,
    }),
  });

  const finished = run.remainingCount === 0;
  const failedCount = run.recipientCount - run.sentCount;
  const status = !finished ? "incomplete" : failedCount && !run.sentCount ? "failed" : "sent";
  // error is not-null in production even though it isn't declared that way in
  // the migration (schema drift), so a fully successful run must still write
  // something — writing null here silently failed the update and left the row
  // stuck on 'sending' forever, which then blocked every future day sharing
  // its day_number under the idempotency guard.
  const { error: ledgerUpdateError } = await supabase.from("email_devotional_broadcast_ledger").update({
    status: finished ? status : "sending",
    recipient_count: run.recipientCount,
    error: finished && failedCount ? { sentCount: run.sentCount, failedCount, failures: run.failures } : {},
  }).eq("id", ledgerId);
  if (ledgerUpdateError) throw new Error(`Devotional ledger could not be finalized: ${ledgerUpdateError.message}`);

  return { status, ledgerId, dayNumber, recipientCount: run.recipientCount, sentCount: run.sentCount, failedCount, remainingCount: run.remainingCount };
}

// Finishes a day's send that was cut off. The day, series and link are rebuilt from the ledger row,
// and only subscribers without a 'sent' delivery are mailed.
export async function resumeDevotionalBroadcast(ledgerId: string): Promise<DevotionalRunResult> {
  const supabase = getClient();
  const { data: ledger, error } = await supabase
    .from("email_devotional_broadcast_ledger")
    .select("id, status, devotional_id, day_number")
    .eq("id", ledgerId)
    .maybeSingle();
  if (error) throw new Error(`Devotional ledger lookup failed: ${error.message}`);
  if (!ledger) return { status: "no_broadcast" };
  if (ledger.status === "sent") return { status: "already_complete" };
  if (!ledger.devotional_id) return { status: "no_devotional" };

  const { data: devotional } = await supabase
    .from("teaching_devotionals")
    .select("id, slug, title, status")
    .eq("id", ledger.devotional_id)
    .maybeSingle();
  if (!devotional || devotional.status !== "published") return { status: "no_devotional" };

  const { count: totalDays } = await supabase
    .from("teaching_devotional_days")
    .select("id", { count: "exact", head: true })
    .eq("devotional_id", devotional.id);
  if (!totalDays) return { status: "no_devotional" };

  const dayNumber = ledger.day_number as number;
  const { data: day } = await supabase
    .from("teaching_devotional_days")
    .select(DAY_COLUMNS)
    .eq("devotional_id", devotional.id)
    .eq("day_number", dayNumber)
    .maybeSingle();
  if (!day) return { status: "no_day_content", dayNumber };

  const teaching = await resolveAssignedTeaching(devotional.id);
  return deliverDay({ ledgerId, devotional, day: day as DayContent, dayNumber, totalDays, teaching });
}
