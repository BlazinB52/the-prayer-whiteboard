"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/supabase/admin";
import { friendlyRevisionError } from "@/lib/teaching-revisions";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function back(revisionId: string, params: Record<string, string>) {
  const query = new URLSearchParams(params).toString();
  return `/admin/teaching-revisions/${revisionId}${query ? `?${query}` : ""}`;
}

function refresh(revisionId?: string) {
  revalidatePath("/admin/teaching-revisions");
  if (revisionId) revalidatePath(`/admin/teaching-revisions/${revisionId}`);
  revalidatePath("/admin");
  revalidatePath("/admin/teachings");
  revalidatePath("/admin/devotionals");
  revalidatePath("/admin/weekly-updates");
}

type AdminSupabase = Awaited<ReturnType<typeof requireAdmin>>["supabase"];

// A revision belongs to a teaching or a devotional; each has its own review functions in the database.
async function revisionSubject(supabase: AdminSupabase, revisionId: string) {
  const { data } = await supabase.from("content_revisions").select("subject_type").eq("id", revisionId).maybeSingle();
  return data?.subject_type === "devotional" ? "devotional" : data?.subject_type === "weekly_update" ? "weekly_update" : "teaching";
}

const REVIEW_ONE = { teaching: "review_teaching_revision_change", devotional: "review_devotional_revision_change", weekly_update: "review_weekly_update_revision_change" } as const;
const REVIEW_ALL = { teaching: "review_all_teaching_revision_changes", devotional: "review_all_devotional_revision_changes", weekly_update: "review_all_weekly_update_revision_changes" } as const;

// Every action below is Administrator-only twice over: requireAdmin() turns away anyone else here,
// and the database functions refuse a non-Administrator on their own.

export async function reviewChange(formData: FormData) {
  const revisionId = String(formData.get("revisionId") ?? "");
  const changeId = String(formData.get("changeId") ?? "");
  const decision = String(formData.get("decision") ?? "");
  if (!UUID_PATTERN.test(revisionId) || !UUID_PATTERN.test(changeId) || !["accept", "accept_anyway", "reject"].includes(decision)) redirect("/admin/teaching-revisions");
  const { supabase } = await requireAdmin();

  // "accept_anyway" is the Administrator choosing to replace newer wording with a stale proposal. It is a
  // separate, explicit button on one change at a time; Accept All never does it.
  const subject = await revisionSubject(supabase, revisionId);
  const { data, error } = await supabase.rpc(REVIEW_ONE[subject], {
    p_change_id: changeId,
    p_decision: decision === "reject" ? "reject" : "accept",
    p_note: String(formData.get("note") ?? "").trim() || null,
    p_accept_anyway: decision === "accept_anyway",
  });
  if (error) redirect(back(revisionId, { error: friendlyRevisionError(error.message) }));
  refresh(revisionId);
  const finished = Boolean((data as { finished?: boolean } | null)?.finished);
  const acceptedAnyway = Boolean((data as { accepted_anyway?: boolean } | null)?.accepted_anyway);
  redirect(back(revisionId, { done: finished ? "finished" : decision === "reject" ? "rejected" : acceptedAnyway ? "accepted_anyway" : "accepted" }));
}

export async function reviewAllChanges(formData: FormData) {
  const revisionId = String(formData.get("revisionId") ?? "");
  const decision = String(formData.get("decision") ?? "");
  if (!UUID_PATTERN.test(revisionId) || !["accept", "reject"].includes(decision)) redirect("/admin/teaching-revisions");
  const { supabase } = await requireAdmin();

  const subject = await revisionSubject(supabase, revisionId);
  const { data, error } = await supabase.rpc(REVIEW_ALL[subject], { p_revision_id: revisionId, p_decision: decision });
  if (error) redirect(back(revisionId, { error: friendlyRevisionError(error.message) }));
  refresh(revisionId);
  const result = (data ?? {}) as { finished?: boolean; skipped_stale?: number };
  if (result.skipped_stale) redirect(back(revisionId, { done: "partial", skipped: String(result.skipped_stale) }));
  redirect(back(revisionId, { done: result.finished ? "finished" : decision }));
}

export async function cancelRevision(formData: FormData) {
  const revisionId = String(formData.get("revisionId") ?? "");
  if (!UUID_PATTERN.test(revisionId)) redirect("/admin/teaching-revisions");
  const { supabase } = await requireAdmin();

  const { error } = await supabase.rpc("cancel_teaching_revision", { p_revision_id: revisionId, p_note: String(formData.get("note") ?? "").trim() || null });
  if (error) redirect(back(revisionId, { error: friendlyRevisionError(error.message) }));
  refresh(revisionId);
  redirect("/admin/teaching-revisions?closed=1");
}

export async function clearRevisionHistory(formData: FormData) {
  const days = Number.parseInt(String(formData.get("days") ?? "30"), 10);
  const { supabase } = await requireAdmin();
  if (!Number.isInteger(days) || days < 0 || days > 3650) redirect("/admin/teaching-revisions?error=" + encodeURIComponent("Choose a number of days between 0 and 3650."));

  const { data, error } = await supabase.rpc("purge_revision_history", { p_older_than_days: days });
  if (error) redirect("/admin/teaching-revisions?error=" + encodeURIComponent(friendlyRevisionError(error.message)));
  refresh();
  redirect(`/admin/teaching-revisions?cleared=${typeof data === "number" ? data : 0}`);
}
