"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireContentManager } from "@/lib/supabase/admin";
import { friendlyRevisionError, normalizeRevisionText, parseFieldId } from "@/lib/teaching-revisions";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type WeeklyUpdateReviewState = { error?: string; saved?: boolean; savedCount?: number };

// A co-editor's actions only ever call the review functions in the database. Nothing here writes to
// the weekly update, and the database re-checks who is calling and what state the revision is in, so
// these checks are a convenience, not the protection.
export async function saveWeeklyUpdateReview(weeklyUpdateId: string, _previous: WeeklyUpdateReviewState, formData: FormData): Promise<WeeklyUpdateReviewState> {
  if (!UUID_PATTERN.test(weeklyUpdateId)) return { error: "This weekly update could not be found." };
  const { supabase } = await requireContentManager();
  const intent = String(formData.get("intent") ?? "save");

  const { data: revisionId, error: createError } = await supabase.rpc("create_weekly_update_revision", { p_weekly_update_id: weeklyUpdateId });
  if (createError || !revisionId) return { error: friendlyRevisionError(createError?.message) };

  if (intent === "discard") {
    const { error } = await supabase.rpc("discard_teaching_revision", { p_revision_id: revisionId });
    if (error) return { error: friendlyRevisionError(error.message) };
    revalidatePath(`/admin/cm/weekly-update-review/${weeklyUpdateId}`);
    redirect(`/admin/cm/weekly-update-review/${weeklyUpdateId}?discarded=1`);
  }

  // Only fields whose wording differs from the wording the editor started from are sent.
  const changes: { target_kind: string; target_id: string | null; field_key: string; base_value: string; proposed_value: string }[] = [];
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("value:")) continue;
    const id = key.slice("value:".length);
    const parsed = parseFieldId(id);
    if (!parsed) continue;
    const base = String(formData.get(`base:${id}`) ?? "");
    const proposed = String(value ?? "");
    if (normalizeRevisionText(proposed) === normalizeRevisionText(base)) continue;
    changes.push({ target_kind: parsed.targetKind, target_id: parsed.targetId, field_key: parsed.fieldKey, base_value: base, proposed_value: proposed });
  }

  const { data: savedCount, error: saveError } = await supabase.rpc("save_weekly_update_revision_draft", { p_revision_id: revisionId, p_changes: changes });
  if (saveError) return { error: friendlyRevisionError(saveError.message) };

  if (intent === "submit") {
    const { error: submitError } = await supabase.rpc("submit_weekly_update_revision", { p_revision_id: revisionId });
    if (submitError) return { error: friendlyRevisionError(submitError.message) };
    revalidatePath("/admin/cm/weekly-update-review");
    revalidatePath(`/admin/cm/weekly-update-review/${weeklyUpdateId}`);
    revalidatePath("/admin/teaching-revisions");
    revalidatePath("/admin");
    redirect(`/admin/cm/weekly-update-review/${weeklyUpdateId}?submitted=1`);
  }

  revalidatePath(`/admin/cm/weekly-update-review/${weeklyUpdateId}`);
  return { saved: true, savedCount: typeof savedCount === "number" ? savedCount : changes.length };
}
