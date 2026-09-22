import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/service-role";

function getClient() {
  const supabase = createServiceRoleClient();
  if (!supabase) throw new Error("Devotional enrollment storage is not configured.");
  return supabase;
}

// Called only from confirmed-subscriber paths, so an unconfirmed address is
// never enrolled. Re-subscribing to a series already completed restarts it at
// day 1; an in-progress enrollment is left untouched so pacing is not reset.
export async function enrollSubscriberInDevotional(subscriberId: string, seriesSlug: string) {
  const slug = seriesSlug.trim();
  if (!slug) return;

  const supabase = getClient();
  const { data: existing, error } = await supabase
    .from("email_devotional_enrollments")
    .select("id, status")
    .eq("subscriber_id", subscriberId)
    .eq("series_slug", slug)
    .maybeSingle();
  if (error) throw new Error(`Devotional enrollment lookup failed: ${error.message}`);

  if (!existing) {
    const { error: insertError } = await supabase.from("email_devotional_enrollments").insert({
      subscriber_id: subscriberId,
      series_slug: slug,
      current_day: 1,
      status: "active",
    });
    // A concurrent confirmation may win the race; the unique index makes that safe.
    if (insertError && insertError.code !== "23505") {
      throw new Error(`Devotional enrollment failed: ${insertError.message}`);
    }
    return;
  }

  if (existing.status === "active") return;

  const { error: updateError } = await supabase
    .from("email_devotional_enrollments")
    .update({ status: "active", current_day: 1, last_sent_at: null })
    .eq("id", existing.id);
  if (updateError) throw new Error(`Devotional re-enrollment failed: ${updateError.message}`);
}

// An unsubscribed or suppressed subscriber must stop receiving daily devotionals.
export async function pauseDevotionalEnrollments(subscriberId: string) {
  const supabase = getClient();
  await supabase
    .from("email_devotional_enrollments")
    .update({ status: "paused" })
    .eq("subscriber_id", subscriberId)
    .eq("status", "active");
}
