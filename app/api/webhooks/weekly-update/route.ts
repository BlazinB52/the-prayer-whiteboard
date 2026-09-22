import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { broadcastWeeklyUpdate } from "@/lib/weekly-update-broadcast";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Fan-out is sequential and throttled, so allow the full function budget.
export const maxDuration = 60;

type WebhookPayload = {
  type?: string;
  table?: string;
  schema?: string;
  record?: { id?: unknown; status?: unknown; is_current?: unknown } | null;
};

function timingSafeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

export async function POST(request: Request) {
  const secret = process.env.SUPABASE_WEBHOOK_SECRET ?? "";
  if (!secret) return NextResponse.json({ error: "Webhook is not configured." }, { status: 503 });

  const provided = request.headers.get("x-webhook-secret") ?? "";
  if (!provided || !timingSafeEqual(provided, secret)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let payload: WebhookPayload;
  try {
    payload = (await request.json()) as WebhookPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  if (payload.schema !== "public" || payload.table !== "weekly_updates") {
    return NextResponse.json({ error: "Unsupported table." }, { status: 400 });
  }
  if (payload.type !== "INSERT" && payload.type !== "UPDATE") {
    return NextResponse.json({ skipped: "unsupported_event" }, { status: 200 });
  }

  const record = payload.record;
  const weeklyUpdateId = typeof record?.id === "string" ? record.id : null;
  if (!weeklyUpdateId) return NextResponse.json({ error: "Missing record id." }, { status: 400 });
  if (record?.status !== "published" || record?.is_current !== true) {
    return NextResponse.json({ skipped: "not_current_published" }, { status: 200 });
  }

  try {
    const outcome = await broadcastWeeklyUpdate(weeklyUpdateId);
    // Duplicates are the expected path when a published update is edited again,
    // so they are a success for the webhook, not a retryable error.
    if (outcome.status === "duplicate") return NextResponse.json({ skipped: "already_broadcast" }, { status: 200 });
    if (outcome.status === "not_publishable") return NextResponse.json({ skipped: "not_current_published" }, { status: 200 });
    return NextResponse.json(outcome, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Broadcast failed." }, { status: 500 });
  }
}
