import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { scheduleContinuation } from "@/lib/send-deliveries";
import { getAuthorizedUser } from "@/lib/supabase/admin";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { broadcastTeaching, resumeTeachingBroadcast } from "@/lib/teaching-broadcast";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// The send stops at about 40s and hands the rest to the resume route, so no request has to finish the whole list.
export const maxDuration = 60;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The only way a teaching is emailed to subscribers: an Administrator asks for it. Publishing a teaching
// never sends anything. The send is idempotent (the ledger row is claimed first), and a send that was
// cut short is resumed, which mails only subscribers who do not have the email yet.
export async function POST(request: Request) {
  const user = await getAuthorizedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const limit = await checkRateLimit("teaching-send-email", 10, 10 * 60 * 1000);
  if (!limit.allowed) return NextResponse.json({ error: "Too many requests. Please wait a few minutes." }, { status: 429 });

  let teachingId = "";
  try {
    const body = (await request.json()) as { teaching_id?: unknown };
    teachingId = typeof body.teaching_id === "string" ? body.teaching_id.trim() : "";
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }
  if (!UUID_PATTERN.test(teachingId)) return NextResponse.json({ error: "A valid teaching_id is required." }, { status: 400 });

  const supabase = createServiceRoleClient();
  if (!supabase) return NextResponse.json({ error: "Broadcast storage is not configured." }, { status: 503 });

  try {
    const { data: ledger, error } = await supabase.from("email_teaching_broadcast_events").select("id, status").eq("teaching_id", teachingId).maybeSingle();
    if (error) return NextResponse.json({ error: "The send could not be checked." }, { status: 500 });

    const outcome = ledger
      ? ledger.status === "sent" ? ({ status: "already_complete" } as const) : await resumeTeachingBroadcast(teachingId)
      : await broadcastTeaching(teachingId);

    // Out of time, not out of subscribers: hand the rest to the resume route. (Without the secret that
    // call is refused and the Administrator uses Resume sending instead.)
    const secret = process.env.SUPABASE_WEBHOOK_SECRET ?? "";
    if (outcome.status === "incomplete") scheduleContinuation("/api/webhooks/teaching/resume", { "x-webhook-secret": secret }, { teaching_id: teachingId });
    return NextResponse.json(outcome, { status: 200 });
  } catch {
    return NextResponse.json({ error: "The email could not be sent. Check the box below and press Resume if it says the send did not finish." }, { status: 500 });
  }
}
