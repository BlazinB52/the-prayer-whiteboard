import crypto from "node:crypto";
import { after, NextResponse } from "next/server";
import { siteUrl } from "@/lib/email-subscriptions";
import { getAuthorizedUser } from "@/lib/supabase/admin";
import { resumeWeeklyUpdateBroadcast } from "@/lib/weekly-update-broadcast";

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

// Continues a weekly update broadcast that ran out of time. Called by the broadcast itself (with the
// webhook secret) and by the admin "Finish sending" button (with an admin session). Each call mails
// only subscribers who have not been sent the update, then chains itself until nothing is left.
export async function POST(request: Request) {
  const secret = process.env.SUPABASE_WEBHOOK_SECRET ?? "";
  const provided = request.headers.get("x-webhook-secret") ?? "";
  const hasSecret = Boolean(secret && provided && timingSafeEqual(provided, secret));
  if (!hasSecret && !(await getAuthorizedUser())) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  let weeklyUpdateId = "";
  try {
    const body = (await request.json()) as { weekly_update_id?: unknown };
    weeklyUpdateId = typeof body.weekly_update_id === "string" ? body.weekly_update_id.trim() : "";
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }
  if (!UUID_PATTERN.test(weeklyUpdateId)) return NextResponse.json({ error: "A valid weekly_update_id is required." }, { status: 400 });

  try {
    const outcome = await resumeWeeklyUpdateBroadcast(weeklyUpdateId);
    if (outcome.status === "incomplete" && secret) {
      after(async () => {
        await fetch(`${siteUrl()}/api/webhooks/weekly-update/resume`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-webhook-secret": secret },
          body: JSON.stringify({ weekly_update_id: weeklyUpdateId }),
        }).catch(() => undefined);
      });
    }
    return NextResponse.json(outcome, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Resume failed." }, { status: 500 });
  }
}
