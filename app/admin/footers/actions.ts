"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/supabase/admin";

type FormState = { error?: string; saved?: boolean; deleted?: boolean };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function readFooterFields(formData: FormData) {
  const internalTitle = String(formData.get("internalTitle") ?? "").trim();
  const content = String(formData.get("content") ?? "").trim();
  if (!internalTitle || internalTitle.length > 160) return { error: "Footer name is required and must be 160 characters or fewer." };
  if (!content || content.length > 5000) return { error: "Footer content is required and must be 5,000 characters or fewer." };
  return { value: { internal_title: internalTitle, content } };
}

function revalidateFooterPaths() {
  revalidatePath("/admin/footers");
  revalidatePath("/admin/teachings");
  revalidatePath("/admin/weekly-updates");
  revalidatePath("/");
  revalidatePath("/weekly-update");
}

export async function createFooter(_: FormState, formData: FormData): Promise<FormState> {
  const { supabase } = await requireAdmin();
  const fields = readFooterFields(formData);
  if (fields.error || !fields.value) return { error: fields.error ?? "Footer could not be saved." };

  const { error } = await supabase.from("content_footers").insert({ ...fields.value, status: "active" });
  if (error) return { error: "Footer could not be created." };
  revalidateFooterPaths();
  return { saved: true };
}

export async function updateFooter(id: string, _: FormState, formData: FormData): Promise<FormState> {
  if (!UUID_PATTERN.test(id)) return { error: "Footer could not be found." };
  const { supabase } = await requireAdmin();
  const fields = readFooterFields(formData);
  if (fields.error || !fields.value) return { error: fields.error ?? "Footer could not be saved." };

  const { data, error } = await supabase.from("content_footers").update(fields.value).eq("id", id).select("id").maybeSingle();
  if (error || !data) return { error: "Footer could not be saved." };
  revalidateFooterPaths();
  return { saved: true };
}

export async function archiveFooter(id: string, previousState: FormState): Promise<FormState> {
  void previousState;
  if (!UUID_PATTERN.test(id)) return { error: "Footer could not be found." };
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase.from("content_footers").update({ status: "archived" }).eq("id", id).eq("status", "active").select("id").maybeSingle();
  if (error || !data) return { error: "Footer could not be archived." };
  revalidateFooterPaths();
  return { saved: true };
}

export async function deleteFooter(id: string, _: FormState, formData: FormData): Promise<FormState> {
  if (!UUID_PATTERN.test(id)) return { error: "Footer could not be found." };
  if (String(formData.get("confirmation") ?? "").trim() !== "DELETE") return { error: "Type DELETE to permanently delete this footer." };

  const { supabase } = await requireAdmin();
  const [{ count: teachingCount }, { count: weeklyUpdateCount }] = await Promise.all([
    supabase.from("teaching_footer_assignments").select("teaching_id", { count: "exact", head: true }).eq("footer_id", id),
    supabase.from("weekly_update_footer_assignments").select("weekly_update_id", { count: "exact", head: true }).eq("footer_id", id),
  ]);
  if ((teachingCount ?? 0) + (weeklyUpdateCount ?? 0) > 0) return { error: "This footer is assigned. Remove its assignments before deleting it." };

  const { data, error } = await supabase.from("content_footers").delete().eq("id", id).select("id").maybeSingle();
  if (error || !data) return { error: "Footer could not be deleted." };
  revalidateFooterPaths();
  return { deleted: true };
}
