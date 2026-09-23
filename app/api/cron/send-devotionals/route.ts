import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { processDevotionalQueue } from "@/lib/devotional-send";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Sends are sequential and throttled, so allow the full function budget.
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
    // (Wednesday is day 1 through Tuesday is day 7), so the run needs neither a
    // parent teaching's publish date nor any per-subscriber state.
    const result = await processDevotionalQueue();
    return NextResponse.json(result, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Devotional run failed." }, { status: 500 });
  }
}
