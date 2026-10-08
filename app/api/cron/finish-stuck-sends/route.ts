import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { scheduleContinuation } from "@/lib/send-deliveries";
import { finishStuckSends, sendProblemAlert } from "@/lib/stuck-sends";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function timingSafeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET ?? "";
  const provided = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  return { secret, ok: Boolean(secret && provided && timingSafeEqual(provided, secret)) };
}

async function run(secret: string) {
  const result = await finishStuckSends();
  if (result.continueAfter) {
    // More to do than fits in one request: carry on in the background.
    scheduleContinuation("/api/cron/finish-stuck-sends", { Authorization: `Bearer ${secret}` }, {});
    return NextResponse.json({ resumed: result.resumed, continuing: true }, { status: 200 });
  }
  const alert = await sendProblemAlert(result.problems).catch(() => ({ sent: false as const }));
  return NextResponse.json({ resumed: result.resumed, problems: result.problems, alertSent: alert.sent }, { status: 200 });
}

// Vercel Cron (daily) sends "Authorization: Bearer <CRON_SECRET>".
export async function GET(request: Request) {
  const { secret, ok } = authorized(request);
  if (!secret) return NextResponse.json({ error: "Cron is not configured." }, { status: 503 });
  if (!ok) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  try {
    return await run(secret);
  } catch {
    return NextResponse.json({ error: "Stuck send check failed." }, { status: 500 });
  }
}

// The same check, called by itself to carry on after a send ran out of time.
export async function POST(request: Request) {
  const { secret, ok } = authorized(request);
  if (!ok) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  try {
    return await run(secret);
  } catch {
    return NextResponse.json({ error: "Stuck send check failed." }, { status: 500 });
  }
}
