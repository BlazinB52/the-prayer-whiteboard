import "server-only";

import { loadConfirmedRecipients } from "@/lib/broadcast-recipients";
import { buildDevotionalDayEmail } from "@/lib/devotional-email-content";
import { devotionalDayForDate, devotionalTimeZone } from "@/lib/devotional-schedule";
import { siteUrl } from "@/lib/email-subscriptions";
import { sendSenderTransactionalEmail } from "@/lib/sender-transactional";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

const THROTTLE_MS = 150;
const MAX_RECORDED_FAILURES = 25;

export type DevotionalRunResult =
  | { status: "no_teaching" }
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
// (teaching_id, day_number) index rejects a second blast for the same day.
async function claimDay(teachingId: string, dayNumber: number) {
  const supabase = getClient();
  const { data, error } = await supabase
    .from("email_devotional_broadcast_ledger")
    .insert({ teaching_id: teachingId, day_number: dayNumber, status: "sending" })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") return null;
    throw new Error(`Devotional day could not be claimed: ${error.message}`);
  }
  return data.id as string;
}

async function resolveDevotional(teachingId: string) {
  const supabase = getClient();
  const { data: assignment } = await supabase
    .from("teaching_devotional_assignments")
    .select("devotional_id")
    .eq("teaching_id", teachingId)
    .maybeSingle();

  const devotionalId = assignment?.devotional_id ?? null;
  const query = supabase.from("teaching_devotionals").select("id, slug, status").eq("status", "published");
  const { data: devotional } = devotionalId
    ? await query.eq("id", devotionalId).maybeSingle()
    : await query.eq("teaching_id", teachingId).maybeSingle();
  return devotional ?? null;
}

export async function processDevotionalQueue(now = new Date()): Promise<DevotionalRunResult> {
  const supabase = getClient();

  // The most recently published teaching drives the schedule.
  const { data: teaching, error: teachingError } = await supabase
    .from("teachings")
    .select("id, slug, published_at, status")
    .eq("status", "published")
    .not("published_at", "is", null)
    .order("published_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (teachingError) throw new Error(`Teaching lookup failed: ${teachingError.message}`);
  if (!teaching?.published_at) return { status: "no_teaching" };

  const devotional = await resolveDevotional(teaching.id);
  if (!devotional) return { status: "no_devotional" };

  const { count: totalDays } = await supabase
    .from("teaching_devotional_days")
    .select("id", { count: "exact", head: true })
    .eq("devotional_id", devotional.id);
  if (!totalDays) return { status: "no_devotional" };

  const dayNumber = devotionalDayForDate({
    publishedAt: teaching.published_at,
    now,
    totalDays,
    timeZone: devotionalTimeZone(),
  });
  if (!dayNumber) return { status: "outside_window" };

  const { data: day } = await supabase
    .from("teaching_devotional_days")
    .select("day_number, title, anchor_scriptures, devotional_reading")
    .eq("devotional_id", devotional.id)
    .eq("day_number", dayNumber)
    .maybeSingle();
  if (!day) return { status: "no_day_content", dayNumber };

  const ledgerId = await claimDay(teaching.id, dayNumber);
  if (!ledgerId) return { status: "duplicate", dayNumber };

  const recipients = await loadConfirmedRecipients("devotionals");
  await supabase.from("email_devotional_broadcast_ledger").update({ recipient_count: recipients.length }).eq("id", ledgerId);

  const base = siteUrl();
  const dayUrl = `${base}/teachings/${teaching.slug}/devotional/day/${dayNumber}`;
  const preferencesUrl = `${base}/email-preferences`;

  let sentCount = 0;
  const failures: { subscriberId: string; reason: string }[] = [];

  for (const recipient of recipients) {
    const email = buildDevotionalDayEmail({
      dayNumber: day.day_number,
      totalDays,
      title: day.title,
      anchorScriptures: day.anchor_scriptures ?? [],
      devotionalReading: day.devotional_reading,
      dayUrl,
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
      if (result.ok) sentCount += 1;
      else if (failures.length < MAX_RECORDED_FAILURES) failures.push({ subscriberId: recipient.id, reason: result.reason });
    } catch {
      // One bad recipient must not abandon the rest of the list.
      if (failures.length < MAX_RECORDED_FAILURES) failures.push({ subscriberId: recipient.id, reason: "exception" });
    }

    await sleep(THROTTLE_MS);
  }

  const failedCount = recipients.length - sentCount;
  const status = failedCount && !sentCount ? "failed" : "sent";
  await supabase.from("email_devotional_broadcast_ledger").update({
    status,
    error: failedCount ? { sentCount, failedCount, failures } : null,
  }).eq("id", ledgerId);

  return { status, dayNumber, recipientCount: recipients.length, sentCount, failedCount };
}
