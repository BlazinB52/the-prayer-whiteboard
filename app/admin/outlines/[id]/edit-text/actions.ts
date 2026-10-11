"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/supabase/admin";
import { friendlyRevisionError, normalizeRevisionText } from "@/lib/teaching-revisions";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type EditTextState = { error?: string; savedCount?: number };

// The Administrator edits the wording of a draft outline directly. Only places whose wording differs from
// what the page was opened with are sent, each with the wording it was written against so the database can
// refuse an edit that would overwrite someone else's newer change. The database re-checks that the caller
// is an Administrator and that the outline is still a draft.
export async function saveOutlineText(outlineId: string, _previous: EditTextState, formData: FormData): Promise<EditTextState> {
  if (!UUID_PATTERN.test(outlineId)) return { error: "This outline could not be found." };
  const { supabase } = await requireAdmin();

  const changes: { field_key: string; base_value: string; value: string }[] = [];
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("value:")) continue;
    const fieldKey = key.slice("value:".length);
    if (fieldKey !== "title" && fieldKey !== "subtitle" && !/^block_[0-9]+(_item_[0-9]+|_cell_[0-9]+_[0-9]+)?$/.test(fieldKey)) continue;
    const base = String(formData.get(`base:${fieldKey}`) ?? "");
    const proposed = String(value ?? "");
    if (normalizeRevisionText(proposed) === normalizeRevisionText(base)) continue;
    changes.push({ field_key: fieldKey, base_value: base, value: proposed });
  }
  if (!changes.length) return { error: "You have not changed anything yet." };

  const { data, error } = await supabase.rpc("admin_edit_outline_text", { p_outline_id: outlineId, p_changes: changes });
  if (error) {
    const message = friendlyRevisionError(error.message);
    // The editor can only change wording; emptying a paragraph is a delete, which has its own button.
    return { error: /cannot be empty/i.test(message) ? `${message} To remove a paragraph, save your other edits and use its Delete button.` : message };
  }

  revalidatePath("/admin/outlines");
  revalidatePath(`/admin/outlines/${outlineId}`);
  revalidatePath(`/admin/outlines/${outlineId}/edit-text`);
  return { savedCount: typeof data === "number" ? data : changes.length };
}

// Adds a new paragraph (or list item) after one, or deletes one. The database refuses it unless the caller
// is an Administrator, the outline is a draft, and no Content Manager proposal is still open, because moving
// text would make an open proposal land in the wrong place.
export async function changeOutlineStructure(outlineId: string, kind: "insert" | "delete", fieldKey: string): Promise<{ error?: string }> {
  if (!UUID_PATTERN.test(outlineId)) return { error: "This outline could not be found." };
  if (kind !== "insert" && kind !== "delete") return { error: "That could not be done." };
  if (!/^block_[0-9]+(_item_[0-9]+)?$/.test(fieldKey)) return { error: "That part of the outline cannot be added to or removed." };
  const { supabase } = await requireAdmin();

  const { error } = await supabase.rpc("admin_outline_structure", { p_outline_id: outlineId, p_action: kind, p_field: fieldKey });
  if (error) return { error: friendlyRevisionError(error.message) };

  revalidatePath("/admin/outlines");
  revalidatePath(`/admin/outlines/${outlineId}`);
  revalidatePath(`/admin/outlines/${outlineId}/edit-text`);
  return {};
}
