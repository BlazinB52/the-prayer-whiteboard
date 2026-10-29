import { NextResponse } from "next/server";
import { siteUrl } from "@/lib/email-subscriptions";
import { TEST_CLICK_SUBSCRIBER, teachingClickSecret, verifyTeachingClick } from "@/lib/teaching-click-link";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function redirect(url: string) {
  return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "no-store" } });
}

// The button in a teaching email. Records that this subscriber followed the link, then sends them to the
// teaching. The destination is always read from the teaching row, never from the URL, so the link cannot
// be turned into an open redirect, and a recording problem never keeps a reader from the teaching.
// A mail program only fetches this URL when a person (or a link scanner) follows the link; merely opening
// the email does not, which is the point of tracking this instead of an open pixel.
export async function GET(request: Request) {
  const base = siteUrl();
  const params = new URL(request.url).searchParams;
  const teachingId = params.get("t") ?? "";
  const subscriberId = params.get("s") ?? "";
  const signature = params.get("sig") ?? "";

  const validSubscriber = subscriberId === TEST_CLICK_SUBSCRIBER || UUID_PATTERN.test(subscriberId);
  if (!UUID_PATTERN.test(teachingId) || !validSubscriber || !verifyTeachingClick({ secret: teachingClickSecret(), teachingId, subscriberId, signature })) {
    return redirect(base);
  }

  const supabase = createServiceRoleClient();
  if (!supabase) return redirect(base);

  const { data: teaching } = await supabase.from("teachings").select("slug").eq("id", teachingId).maybeSingle();
  if (!teaching?.slug) return redirect(base);

  // Browsers prefetching a link announce it; that is not a person reading.
  const purpose = `${request.headers.get("purpose") ?? ""} ${request.headers.get("sec-purpose") ?? ""}`.toLowerCase();
  if (subscriberId !== TEST_CLICK_SUBSCRIBER && !purpose.includes("prefetch")) {
    const { error } = await supabase.rpc("record_teaching_email_click", { p_teaching_id: teachingId, p_subscriber_id: subscriberId });
    if (error) console.error("teaching-click: could not record click", error.message);
  }

  return redirect(`${base}/teachings/${teaching.slug}`);
}
