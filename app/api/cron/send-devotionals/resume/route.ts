import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { resumeDevotionalBroadcast } from "@/lib/devotional-send";
import { scheduleContinuation } from "@/lib/send-deliveries";

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

// Continues a day's devotional send that ran out of time. Called by the send itself with the cron
// secret; mails only subscribers who have not been sent that day, then chains itself until done.
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET ?? "";
  const provided = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!secret || !provided || !timingSafeEqual(provided, secret)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  let ledgerId = "";
  try {
    const body = (await request.json()) as { ledger_id?: unknown };
    ledgerId = typeof body.ledger_id === "string" ? body.ledger_id.trim() : "";
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }
  if (!UUID_PATTERN.test(ledgerId)) return NextResponse.json({ error: "A valid ledger_id is required." }, { status: 400 });

  try {
    const result = await resumeDevotionalBroadcast(ledgerId);
    if (result.status === "incomplete") scheduleContinuation("/api/cron/send-devotionals/resume", { Authorization: `Bearer ${secret}` }, { ledger_id: ledgerId });
    return NextResponse.json(result, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Resume failed." }, { status: 500 });
  }
}
