import { NextResponse } from "next/server";
import { buildWeeklyUpdateEmail } from "@/lib/weekly-update-email-content";
import { checkRateLimit } from "@/lib/rate-limit";
import { siteUrl } from "@/lib/email-subscriptions";
import { sendSenderTransactionalEmail } from "@/lib/sender-transactional";
import { getAuthorizedUser } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type TestSendBody = {
  weekly_update_id?: unknown;
  test_email?: unknown;
  first_name?: unknown;
};

// Preview only. This route never reads the subscriber list, never writes to
// email_broadcast_events, and never changes the weekly update row, so a
// preview can never consume the production broadcast's idempotency slot.
export async function POST(request: Request) {
  // getAuthorizedUser returns null for non-admins; requireAdmin would redirect,
  // which is wrong for an API response.
  const user = await getAuthorizedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const limit = await checkRateLimit("weekly-update-test-send", 10, 10 * 60 * 1000);
  if (!limit.allowed) return NextResponse.json({ error: "Too many test sends. Please wait a few minutes." }, { status: 429 });

  let body: TestSendBody;
  try {
    body = (await request.json()) as TestSendBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const weeklyUpdateId = typeof body.weekly_update_id === "string" ? body.weekly_update_id.trim() : "";
  const testEmail = typeof body.test_email === "string" ? body.test_email.trim() : "";
  const firstName = typeof body.first_name === "string" && body.first_name.trim() ? body.first_name.trim() : "Friend";

  if (!UUID_PATTERN.test(weeklyUpdateId)) return NextResponse.json({ error: "A valid weekly_update_id is required." }, { status: 400 });
  if (!EMAIL_PATTERN.test(testEmail) || testEmail.length > 320) return NextResponse.json({ error: "A valid test_email is required." }, { status: 400 });

  // The admin's own session client, so this read is bounded by admin RLS
  // rather than borrowing the service role.
  const supabase = await createClient();
  const { data: update, error } = await supabase
    .from("weekly_updates")
    .select("id, title, body_markdown, converted_content")
    .eq("id", weeklyUpdateId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: "Weekly update could not be read." }, { status: 500 });
  if (!update) return NextResponse.json({ error: "Weekly update not found." }, { status: 404 });

  const base = siteUrl();
  const email = buildWeeklyUpdateEmail({
    firstName,
    title: update.title,
    bodyMarkdown: update.body_markdown,
    convertedContent: update.converted_content,
    weeklyUpdateUrl: `${base}/weekly-update`,
    preferencesUrl: `${base}/email-preferences`,
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
