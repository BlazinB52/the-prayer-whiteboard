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
    const summary = await processDevotionalQueue();
    return NextResponse.json(summary, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Devotional run failed." }, { status: 500 });
  }
}
