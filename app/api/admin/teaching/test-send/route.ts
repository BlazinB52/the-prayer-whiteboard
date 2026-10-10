import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { getEmailCopyrightDisclaimer } from "@/lib/copyright-disclaimers";
import { siteUrl } from "@/lib/email-subscriptions";
import { sendSenderTransactionalEmail } from "@/lib/sender-transactional";
import { buildTeachingEmail } from "@/lib/teaching-email-content";
import { getAuthorizedUser } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type TestSendBody = {
  teaching_id?: unknown;
  test_email?: unknown;
  first_name?: unknown;
};

// Preview only. This route never reads the subscriber list, never writes to
// email_teaching_broadcast_events, and never changes the teaching row, so a
// preview can never consume the production broadcast's idempotency slot.
export async function POST(request: Request) {
  // getAuthorizedUser returns null for non-admins; requireAdmin would redirect,
  // which is wrong for an API response.
  const user = await getAuthorizedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const limit = await checkRateLimit("teaching-test-send", 10, 10 * 60 * 1000);
  if (!limit.allowed) return NextResponse.json({ error: "Too many test sends. Please wait a few minutes." }, { status: 429 });

  let body: TestSendBody;
  try {
    body = (await request.json()) as TestSendBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const teachingId = typeof body.teaching_id === "string" ? body.teaching_id.trim() : "";
  const testEmail = typeof body.test_email === "string" ? body.test_email.trim() : "";
  const firstName = typeof body.first_name === "string" && body.first_name.trim() ? body.first_name.trim() : "Friend";

  if (!UUID_PATTERN.test(teachingId)) return NextResponse.json({ error: "A valid teaching_id is required." }, { status: 400 });
  if (!EMAIL_PATTERN.test(testEmail) || testEmail.length > 320) return NextResponse.json({ error: "A valid test_email is required." }, { status: 400 });

  // The admin's own session client, so this read is bounded by admin RLS
  // rather than borrowing the service role.
  const supabase = await createClient();
  const { data: teaching, error } = await supabase
    .from("teachings")
    .select("id, slug, title, summary, language")
    .eq("id", teachingId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: "Teaching could not be read." }, { status: 500 });
  if (!teaching) return NextResponse.json({ error: "Teaching not found." }, { status: 404 });

  // An Español teaching previews as an Español email (Salvadoran Spanish, RVR1960/NVI footer,
  // Español preferences page), so the test shows what a Spanish subscriber would see.
  // Real sending to Spanish subscribers is still off; see loadPublishableTeaching in lib/teaching-broadcast.ts.
  const language = teaching.language === "es" ? "es" : "en";
  const base = siteUrl();
  const copyrightDisclaimer = await getEmailCopyrightDisclaimer(base, language);
  // The English default name is "Friend"; a Spanish email with no name just says "Hola,".
  const greetingName = language === "es" && !(typeof body.first_name === "string" && body.first_name.trim()) ? "" : firstName;
  const email = buildTeachingEmail({
    firstName: greetingName,
    title: teaching.title,
    summary: teaching.summary,
    teachingUrl: `${base}/teachings/${teaching.slug}`,
    logoUrl: `${base}/images/whiteboard-sword-logo-with-tagline.png`,
    preferencesUrl: language === "es" ? `${base}/espanol/preferencias` : `${base}/email-preferences`,
    copyrightDisclaimer,
    language,
  });

  const result = await sendSenderTransactionalEmail({
    toEmail: testEmail,
    toName: firstName,
    subject: `${language === "es" ? "[PRUEBA]" : "[TEST]"} ${email.subject}`,
    html: email.html,
    text: email.text,
  });

  if (!result.ok) {
    return NextResponse.json({ error: "Test email could not be sent.", reason: result.reason }, { status: 502 });
  }

  return NextResponse.json({ sent: true, testEmail, providerMessageId: result.providerMessageId }, { status: 200 });
}
