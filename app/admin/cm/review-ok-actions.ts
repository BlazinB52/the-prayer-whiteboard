"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireContentManager } from "@/lib/supabase/admin";
import { REVIEW_SUBJECTS, type ReviewSubjectKind } from "@/lib/review-subjects";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// "Reviewed, no changes needed" for a teaching, devotional, outline or handout (a weekly update has its own OK to publish).
// It is a note for the Administrator and changes nothing about the item. The database checks who is calling and that the item
// is a draft that was sent for review; these checks are a convenience.
const KINDS: ReviewSubjectKind[] = ["teaching", "devotional", "outline", "handout"];

function pageFor(kind: ReviewSubjectKind, id: string) {
  return `/admin/cm/${REVIEW_SUBJECTS[kind].reviewFolder}/${id}`;
}

function refresh(kind: ReviewSubjectKind, id: string) {
  revalidatePath("/admin/cm");
  revalidatePath(`/admin/cm/${REVIEW_SUBJECTS[kind].reviewFolder}`);
  revalidatePath(pageFor(kind, id));
  revalidatePath(REVIEW_SUBJECTS[kind].adminPath(id));
}

export async function markReviewedNoChanges(kind: ReviewSubjectKind, id: string) {
  if (!KINDS.includes(kind) || !UUID_PATTERN.test(id)) redirect("/admin/cm");
  const { supabase } = await requireContentManager();
  const { error } = await supabase.rpc("mark_review_ok", { p_subject_type: kind, p_subject_id: id });
  if (error) redirect(`${pageFor(kind, id)}?reviewed=error`);
  refresh(kind, id);
  redirect(`${pageFor(kind, id)}?reviewed=1`);
}

export async function undoReviewedNoChanges(kind: ReviewSubjectKind, id: string) {
  if (!KINDS.includes(kind) || !UUID_PATTERN.test(id)) redirect("/admin/cm");
  const { supabase } = await requireContentManager();
  const { error } = await supabase.rpc("clear_review_ok", { p_subject_type: kind, p_subject_id: id });
  if (error) redirect(`${pageFor(kind, id)}?reviewed=error`);
  refresh(kind, id);
  redirect(`${pageFor(kind, id)}?reviewed=undone`);
}
