import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { getEmailCopyrightDisclaimer } from "@/lib/copyright-disclaimers";
import { buildDevotionalDayEmail, devotionalDayUrl } from "@/lib/devotional-email-content";
import { siteUrl } from "@/lib/email-subscriptions";
import { sendSenderTransactionalEmail } from "@/lib/sender-transactional";
import { getAuthorizedUser } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type TestSendBody = {
  devotional_id?: unknown;
  day_number?: unknown;
  test_email?: unknown;
  first_name?: unknown;
};

// Preview only. This route never reads the subscriber list, never writes to
// email_devotional_broadcast_ledger, and never changes the devotional row, so
// a preview can never consume the production send's idempotency slot for that
// day.
export async function POST(request: Request) {
  // getAuthorizedUser returns null for non-admins; requireAdmin would redirect,
  // which is wrong for an API response.
  const user = await getAuthorizedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const limit = await checkRateLimit("devotional-test-send", 10, 10 * 60 * 1000);
  if (!limit.allowed) return NextResponse.json({ error: "Too many test sends. Please wait a few minutes." }, { status: 429 });

  let body: TestSendBody;
  try {
    body = (await request.json()) as TestSendBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const devotionalId = typeof body.devotional_id === "string" ? body.devotional_id.trim() : "";
  const dayNumber = typeof body.day_number === "number" ? body.day_number : Number(body.day_number);
  const testEmail = typeof body.test_email === "string" ? body.test_email.trim() : "";
  const firstName = typeof body.first_name === "string" && body.first_name.trim() ? body.first_name.trim() : "Friend";

  if (!UUID_PATTERN.test(devotionalId)) return NextResponse.json({ error: "A valid devotional_id is required." }, { status: 400 });
  if (!Number.isInteger(dayNumber) || dayNumber < 1 || dayNumber > 7) return NextResponse.json({ error: "A valid day_number (1-7) is required." }, { status: 400 });
  if (!EMAIL_PATTERN.test(testEmail) || testEmail.length > 320) return NextResponse.json({ error: "A valid test_email is required." }, { status: 400 });

  // The admin's own session client, so these reads are bounded by admin RLS
  // rather than borrowing the service role.
  const supabase = await createClient();
  const { data: devotional, error: devotionalError } = await supabase
    .from("teaching_devotionals")
    .select("id, slug, title")
    .eq("id", devotionalId)
    .maybeSingle();
  if (devotionalError) return NextResponse.json({ error: "Devotional could not be read." }, { status: 500 });
  if (!devotional) return NextResponse.json({ error: "Devotional not found." }, { status: 404 });

  const { count: totalDays } = await supabase
    .from("teaching_devotional_days")
    .select("id", { count: "exact", head: true })
    .eq("devotional_id", devotional.id);

  const { data: day, error: dayError } = await supabase
    .from("teaching_devotional_days")
    .select("day_number, title, anchor_scriptures, devotional_reading, confession, journal_prompt, prayer_activation")
    .eq("devotional_id", devotional.id)
    .eq("day_number", dayNumber)
    .maybeSingle();
  if (dayError) return NextResponse.json({ error: "Devotional day could not be read." }, { status: 500 });
  if (!day) return NextResponse.json({ error: "That devotional day has no content yet." }, { status: 404 });

  const base = siteUrl();
  const copyrightDisclaimer = await getEmailCopyrightDisclaimer(base);
  const email = buildDevotionalDayEmail({
    dayNumber: day.day_number,
    totalDays: totalDays ?? 7,
    title: day.title,
    seriesTitle: devotional.title,
    anchorScriptures: day.anchor_scriptures ?? [],
    devotionalReading: day.devotional_reading,
    confession: day.confession,
    journalPrompt: day.journal_prompt,
    prayerActivation: day.prayer_activation,
    readUrl: devotionalDayUrl(base, devotional.slug, dayNumber),
    logoUrl: `${base}/images/tpwb-email-logo.png`,
    preferencesUrl: `${base}/email-preferences`,
    copyrightDisclaimer,
  });

  const result = await sendSenderTransactionalEmail({
    toEmail: testEmail,
    toName: firstName,
    subject: `[TEST] ${email.subject}`,
    html: email.html,
    text: email.text,
  });

  if (!result.ok) {
    return NextResponse.json({ error: "Test email could not be sent.", reason: result.reason }, { status: 502 });
  }

  return NextResponse.json({ sent: true, testEmail, providerMessageId: result.providerMessageId }, { status: 200 });
}
