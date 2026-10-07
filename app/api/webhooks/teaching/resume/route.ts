import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { scheduleContinuation } from "@/lib/send-deliveries";
import { resumeTeachingBroadcast } from "@/lib/teaching-broadcast";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function timingSafeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

// Continues a teaching broadcast that ran out of time. Called by the broadcast itself with the
// webhook secret; mails only subscribers who have not been sent the teaching, then chains itself
// until nothing is left.
export async function POST(request: Request) {
  const secret = process.env.SUPABASE_WEBHOOK_SECRET ?? "";
  const provided = request.headers.get("x-webhook-secret") ?? "";
  if (!secret || !provided || !timingSafeEqual(provided, secret)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  let teachingId = "";
  try {
    const body = (await request.json()) as { teaching_id?: unknown };
    teachingId = typeof body.teaching_id === "string" ? body.teaching_id.trim() : "";
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }
  if (!UUID_PATTERN.test(teachingId)) return NextResponse.json({ error: "A valid teaching_id is required." }, { status: 400 });

  try {
    const outcome = await resumeTeachingBroadcast(teachingId);
    if (outcome.status === "incomplete") scheduleContinuation("/api/webhooks/teaching/resume", { "x-webhook-secret": secret }, { teaching_id: teachingId });
    return NextResponse.json(outcome, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Resume failed." }, { status: 500 });
  }
}
