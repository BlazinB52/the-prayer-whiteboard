import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { getAuthorizedUser } from "@/lib/supabase/admin";
import { sendWeeklyUpdateToSubscriber } from "@/lib/weekly-update-broadcast";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Sends the published update to one confirmed subscriber who missed the broadcast. Unlike the test
// send it is a real delivery: no [TEST] label, recorded so the person is never mailed twice.
export async function POST(request: Request) {
  const user = await getAuthorizedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const limit = await checkRateLimit("weekly-update-single-send", 20, 10 * 60 * 1000);
  if (!limit.allowed) return NextResponse.json({ error: "Too many sends. Please wait a few minutes." }, { status: 429 });

  let body: { weekly_update_id?: unknown; email?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }
  const weeklyUpdateId = typeof body.weekly_update_id === "string" ? body.weekly_update_id.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim() : "";
  if (!UUID_PATTERN.test(weeklyUpdateId)) return NextResponse.json({ error: "A valid weekly_update_id is required." }, { status: 400 });
  if (!EMAIL_PATTERN.test(email) || email.length > 320) return NextResponse.json({ error: "A valid email is required." }, { status: 400 });

  try {
    const outcome = await sendWeeklyUpdateToSubscriber(weeklyUpdateId, email);
    const messages = {
      not_publishable: "Only the current published update can be sent.",
      not_subscribed: "That address is not a confirmed Weekly Updates subscriber.",
      already_sent: "That subscriber has already been sent this update.",
    } as const;
    if (outcome.status === "sent") return NextResponse.json(outcome, { status: 200 });
    if (outcome.status === "failed") return NextResponse.json({ error: "The email could not be sent.", reason: outcome.reason }, { status: 502 });
    return NextResponse.json({ error: messages[outcome.status] }, { status: 409 });
  } catch {
    return NextResponse.json({ error: "The email could not be sent." }, { status: 500 });
  }
}
