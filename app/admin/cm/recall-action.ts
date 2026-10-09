"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireContentManager } from "@/lib/supabase/admin";
import { friendlyRevisionError } from "@/lib/teaching-revisions";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const REVIEW_PATHS = {
  teaching: "teaching-review",
  devotional: "devotional-review",
  "weekly-update": "weekly-update-review",
} as const;

export type RecallSubject = keyof typeof REVIEW_PATHS;
export type RecallState = { error?: string };

// Takes the editor's own submitted revision back to a draft. The database refuses it once an
// Administrator has opened the revision, so this is only the doorway; it is not the protection.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function recallSubmittedRevision(subject: RecallSubject, subjectId: string, revisionId: string, _previous: RecallState): Promise<RecallState> {
  const base = REVIEW_PATHS[subject];
  if (!base || !UUID_PATTERN.test(subjectId) || !UUID_PATTERN.test(revisionId)) return { error: "This revision could not be found." };
  const { supabase } = await requireContentManager();

  const { error } = await supabase.rpc("recall_revision", { p_revision_id: revisionId });
  if (error) return { error: friendlyRevisionError(error.message) };

  revalidatePath(`/admin/cm/${base}`);
  revalidatePath(`/admin/cm/${base}/${subjectId}`);
  revalidatePath("/admin/teaching-revisions");
  revalidatePath("/admin");
  redirect(`/admin/cm/${base}/${subjectId}?recalled=1`);
}
