import "server-only";

import { loadConfirmedRecipients } from "@/lib/broadcast-recipients";
import { buildDevotionalDayEmail, devotionalDayUrl } from "@/lib/devotional-email-content";
import { devotionalDayForWeekday, devotionalTimeZone } from "@/lib/devotional-schedule";
import { siteUrl } from "@/lib/email-subscriptions";
import { isSuppressionRejection, markSubscriberSuppressed } from "@/lib/sender-suppression";
import { sendSenderTransactionalEmail } from "@/lib/sender-transactional";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

const THROTTLE_MS = 150;
const MAX_RECORDED_FAILURES = 25;

export type DevotionalRunResult =
  | { status: "no_devotional" }
  | { status: "outside_window" }
  | { status: "no_day_content"; dayNumber: number }
  | { status: "duplicate"; dayNumber: number }
  | { status: "sent" | "failed"; dayNumber: number; recipientCount: number; sentCount: number; failedCount: number };

function getClient() {
  const supabase = createServiceRoleClient();
  if (!supabase) throw new Error("Devotional send storage is not configured.");
  return supabase;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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

export async function processDevotionalQueue(now = new Date()): Promise<DevotionalRunResult> {
  const supabase = getClient();

  // The most recently published series drives the run. It is read straight off
  // teaching_devotionals, so a series authored standalone is eligible on the
  // same terms as one that started life inside a teaching.
  const { data: devotional, error: devotionalError } = await supabase
    .from("teaching_devotionals")
    .select("id, slug, title, status, published_at, updated_at")
    .eq("status", "published")
    .order("published_at", { ascending: false, nullsFirst: false })
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (devotionalError) throw new Error(`Devotional lookup failed: ${devotionalError.message}`);
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
    .select("day_number, title, anchor_scriptures, devotional_reading, confession, journal_prompt, prayer_activation")
    .eq("devotional_id", devotional.id)
    .eq("day_number", dayNumber)
    .maybeSingle();
  if (!day) return { status: "no_day_content", dayNumber };

  const teaching = await resolveAssignedTeaching(devotional.id);
  const ledgerId = await claimDay(devotional.id, dayNumber, teaching?.id ?? null);
  if (!ledgerId) return { status: "duplicate", dayNumber };

  const recipients = await loadConfirmedRecipients("devotionals");
  await supabase.from("email_devotional_broadcast_ledger").update({ recipient_count: recipients.length }).eq("id", ledgerId);

  const base = siteUrl();
  // The email reads through to the assigned teaching when there is one, since
  // that is the fuller page for this devotional's content; a standalone series
  // has no teaching page, so it falls back to the devotional's own day URL.
  const readUrl = teaching ? `${base}/teachings/${teaching.slug}` : devotionalDayUrl(base, devotional.slug, dayNumber);
  const preferencesUrl = `${base}/email-preferences`;

  let sentCount = 0;
  const failures: { subscriberId: string; reason: string }[] = [];

  for (const recipient of recipients) {
    const email = buildDevotionalDayEmail({
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
    });

    try {
      const result = await sendSenderTransactionalEmail({
        toEmail: recipient.email,
        toName: recipient.firstName,
        subject: email.subject,
        html: email.html,
        text: email.text,
      });
      if (result.ok) {
        sentCount += 1;
      } else {
        if (failures.length < MAX_RECORDED_FAILURES) failures.push({ subscriberId: recipient.id, reason: result.reason });
        if (isSuppressionRejection(result)) await markSubscriberSuppressed(recipient.id);
      }
    } catch {
      // One bad recipient must not abandon the rest of the list.
      if (failures.length < MAX_RECORDED_FAILURES) failures.push({ subscriberId: recipient.id, reason: "exception" });
    }

    await sleep(THROTTLE_MS);
  }

  const failedCount = recipients.length - sentCount;
  const status = failedCount && !sentCount ? "failed" : "sent";
  // error is not-null in production even though it isn't declared that way in
  // the migration (schema drift), so a fully successful run must still write
  // something — writing null here silently failed the update and left the row
  // stuck on 'sending' forever, which then blocked every future day sharing
  // its day_number under the idempotency guard.
  const { error: ledgerUpdateError } = await supabase.from("email_devotional_broadcast_ledger").update({
    status,
    error: failedCount ? { sentCount, failedCount, failures } : {},
  }).eq("id", ledgerId);
  if (ledgerUpdateError) throw new Error(`Devotional ledger could not be finalized: ${ledgerUpdateError.message}`);

  return { status, dayNumber, recipientCount: recipients.length, sentCount, failedCount };
}
