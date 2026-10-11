"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/supabase/admin";
import { friendlyRevisionError, normalizeRevisionText } from "@/lib/teaching-revisions";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type EditTextState = { error?: string; savedCount?: number };

// The Administrator edits the wording of a draft directly. Only paragraphs whose wording differs from what
// the page was opened with are sent, each with the wording it was written against so the database can
// refuse an edit that would overwrite someone else's newer change. The database re-checks that the caller
// is an Administrator and that the weekly update is still a draft.
export async function saveWeeklyUpdateText(weeklyUpdateId: string, _previous: EditTextState, formData: FormData): Promise<EditTextState> {
  if (!UUID_PATTERN.test(weeklyUpdateId)) return { error: "This weekly update could not be found." };
  const { supabase } = await requireAdmin();

  const changes: { field_key: string; base_value: string; value: string }[] = [];
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("value:")) continue;
    const fieldKey = key.slice("value:".length);
    if (fieldKey !== "title" && !/^block_[0-9]+$/.test(fieldKey)) continue;
    const base = String(formData.get(`base:${fieldKey}`) ?? "");
    const proposed = String(value ?? "");
    if (normalizeRevisionText(proposed) === normalizeRevisionText(base)) continue;
    changes.push({ field_key: fieldKey, base_value: base, value: proposed });
  }
  if (!changes.length) return { error: "You have not changed anything yet." };

  const { data, error } = await supabase.rpc("admin_edit_weekly_update_text", { p_weekly_update_id: weeklyUpdateId, p_changes: changes });
  if (error) return { error: friendlyRevisionError(error.message) };

  revalidatePath("/admin/weekly-updates");
  revalidatePath(`/admin/weekly-updates/${weeklyUpdateId}/edit-text`);
  return { savedCount: typeof data === "number" ? data : changes.length };
}
