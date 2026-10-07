import crypto from "node:crypto";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Fan-out is sequential and throttled. A request stops sending at about 40s and hands the rest to
// the resume route, so no single request depends on finishing the whole list.
export const maxDuration = 60;

type WebhookPayload = {
  type?: string;
  table?: string;
  schema?: string;
  record?: { id?: unknown; status?: unknown } | null;
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

  if (payload.schema !== "public" || payload.table !== "teachings") {
    return NextResponse.json({ error: "Unsupported table." }, { status: 400 });
  }
  if (payload.type !== "INSERT" && payload.type !== "UPDATE") {
    return NextResponse.json({ skipped: "unsupported_event" }, { status: 200 });
  }

  const record = payload.record;
  const teachingId = typeof record?.id === "string" ? record.id : null;
  if (!teachingId) return NextResponse.json({ error: "Missing record id." }, { status: 400 });
  if (record?.status !== "published") {
    return NextResponse.json({ skipped: "not_published" }, { status: 200 });
  }

  // Publishing a teaching no longer emails subscribers. The email is sent only when an Administrator asks
  // for it (POST /api/admin/teaching/send-email), so this endpoint accepts the call and does nothing.
  return NextResponse.json({ skipped: "manual_send_only" }, { status: 200 });
}
