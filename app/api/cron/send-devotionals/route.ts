import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { processDevotionalQueue } from "@/lib/devotional-send";
import { scheduleContinuation } from "@/lib/send-deliveries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Sends are sequential and throttled. A request stops sending at about 40s and hands the rest to
// the resume route, so no single request depends on finishing the whole list.
export const maxDuration = 60;

function timingSafeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

// Vercel Cron sends "Authorization: Bearer <CRON_SECRET>".
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET ?? "";
  if (!secret) return NextResponse.json({ error: "Cron is not configured." }, { status: 503 });

  const provided = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!provided || !timingSafeEqual(provided, secret)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    // The day number comes from today's weekday in DEVOTIONAL_TIME_ZONE alone
    // (Saturday is day 1 through Friday is day 7), so the run needs neither a
    // parent teaching's publish date nor any per-subscriber state.
    const result = await processDevotionalQueue();
    // Out of time, not out of subscribers: hand the rest to the resume route.
    if (result.status === "incomplete") scheduleContinuation("/api/cron/send-devotionals/resume", { Authorization: `Bearer ${secret}` }, { ledger_id: result.ledgerId });
    return NextResponse.json(result, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Devotional run failed." }, { status: 500 });
  }
}
