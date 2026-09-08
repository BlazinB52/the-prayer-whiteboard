"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isPrayerPraiseCategory, PUBLIC_SUMMARY_MAX_LENGTH } from "@/lib/prayer-and-praise";
import { requireAdmin } from "@/lib/supabase/admin";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type FormState = { error?: string; saved?: boolean };
export type PrayerPraiseActionState = { error?: string };

function readSummary(formData: FormData) {
  const value = String(formData.get("publicSummary") ?? "").trim();
  if (!value) return { error: "Public summary is required." };
  if (value.length > PUBLIC_SUMMARY_MAX_LENGTH) return { error: `Public summary must be ${PUBLIC_SUMMARY_MAX_LENGTH} characters or fewer.` };
  return { value };
}

function readCategory(formData: FormData) {
  const value = String(formData.get("category") ?? "").trim();
  if (!isPrayerPraiseCategory(value)) return { error: "Choose a valid category." };
  return { value };
}

function addDays(value: Date, days: number) {
  const next = new Date(value);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString();
}

function revalidatePrayerPraise() {
  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath("/admin/prayer-and-praise");
  revalidatePath("/prayer-and-praise");
}

async function loadPrayer(supabase: Awaited<ReturnType<typeof requireAdmin>>["supabase"], id: string) {
  if (!UUID_PATTERN.test(id)) return null;
  const { data } = await supabase
    .from("prayer_needs")
    .select("id, status, expires_at")
    .eq("id", id)
    .maybeSingle();
  return data;
}

async function loadPraise(supabase: Awaited<ReturnType<typeof requireAdmin>>["supabase"], id: string) {
  if (!UUID_PATTERN.test(id)) return null;
  const { data } = await supabase
    .from("praise_reports")
    .select("id, status")
    .eq("id", id)
    .maybeSingle();
  return data;
}

export async function createPrayerPoint(_: FormState, formData: FormData): Promise<FormState> {
  const { supabase } = await requireAdmin();
  const category = readCategory(formData);
  const summary = readSummary(formData);
  if (category.error) return category;
  if (summary.error) return summary;

  const { error } = await supabase
    .from("prayer_needs")
    .insert({ category: category.value, public_summary: summary.value, status: "draft" });

  if (error) return { error: "This prayer point could not be created." };
  revalidatePrayerPraise();
  redirect("/admin/prayer-and-praise?prayer=saved");
}

export async function updatePrayerPoint(id: string, _: FormState, formData: FormData): Promise<FormState> {
  const { supabase } = await requireAdmin();
  const prayer = await loadPrayer(supabase, id);
  if (!prayer) return { error: "This prayer point could not be found." };

  const category = readCategory(formData);
  const summary = readSummary(formData);
  if (category.error) return category;
  if (summary.error) return summary;

  const { error } = await supabase
    .from("prayer_needs")
    .update({ category: category.value, public_summary: summary.value })
    .eq("id", prayer.id);

  if (error) return { error: "This prayer point could not be saved." };
  revalidatePrayerPraise();
  return { saved: true };
}

export async function publishPrayerPoint(id: string, previousState: PrayerPraiseActionState): Promise<PrayerPraiseActionState> {
  void previousState;
  const { supabase } = await requireAdmin();
  const prayer = await loadPrayer(supabase, id);
  if (!prayer) return { error: "This prayer point could not be found." };
  if (prayer.status !== "draft") return { error: "Only draft prayer points can be published." };

  const publishedAt = new Date();
  const { error } = await supabase
    .from("prayer_needs")
    .update({ status: "active", published_at: publishedAt.toISOString(), expires_at: addDays(publishedAt, 30), answered_at: null })
    .eq("id", prayer.id)
    .eq("status", "draft");

  if (error) return { error: "This prayer point could not be published." };
  revalidatePrayerPraise();
  redirect("/admin/prayer-and-praise?prayer=published");
}

export async function markPrayerAnswered(id: string, previousState: PrayerPraiseActionState): Promise<PrayerPraiseActionState> {
  void previousState;
  const { supabase } = await requireAdmin();
  const prayer = await loadPrayer(supabase, id);
  if (!prayer) return { error: "This prayer point could not be found." };
  if (!["active", "draft"].includes(prayer.status)) return { error: "Only draft or active prayer points can be marked answered." };

  const { error } = await supabase
    .from("prayer_needs")
    .update({ status: "answered", answered_at: new Date().toISOString() })
    .eq("id", prayer.id)
    .in("status", ["draft", "active"]);

  if (error) return { error: "This prayer point could not be marked answered." };
  revalidatePrayerPraise();
  redirect("/admin/prayer-and-praise?prayer=answered");
}

export async function extendPrayerPoint(id: string, previousState: PrayerPraiseActionState): Promise<PrayerPraiseActionState> {
  void previousState;
  const { supabase } = await requireAdmin();
  const prayer = await loadPrayer(supabase, id);
  if (!prayer) return { error: "This prayer point could not be found." };
  if (prayer.status !== "active") return { error: "Only active prayer points can be extended." };

  const baseDate = prayer.expires_at && new Date(prayer.expires_at).getTime() > Date.now() ? new Date(prayer.expires_at) : new Date();
  const { error } = await supabase
    .from("prayer_needs")
    .update({ expires_at: addDays(baseDate, 30) })
    .eq("id", prayer.id)
    .eq("status", "active");

  if (error) return { error: "This prayer point could not be extended." };
  revalidatePrayerPraise();
  redirect("/admin/prayer-and-praise?prayer=extended");
}

export async function archivePrayerPoint(id: string, previousState: PrayerPraiseActionState): Promise<PrayerPraiseActionState> {
  void previousState;
  const { supabase } = await requireAdmin();
  const prayer = await loadPrayer(supabase, id);
  if (!prayer) return { error: "This prayer point could not be found." };
  if (!["active", "draft", "answered"].includes(prayer.status)) return { error: "This prayer point cannot be archived." };

  const { error } = await supabase
    .from("prayer_needs")
    .update({ status: "archived" })
    .eq("id", prayer.id);

  if (error) return { error: "This prayer point could not be archived." };
  revalidatePrayerPraise();
  redirect("/admin/prayer-and-praise?prayer=archived");
}

export async function deletePrayerPoint(id: string, previousState: PrayerPraiseActionState, formData: FormData): Promise<PrayerPraiseActionState> {
  void previousState;
  const { supabase } = await requireAdmin();
  const prayer = await loadPrayer(supabase, id);
  if (!prayer) return { error: "This prayer point could not be found." };
  if (String(formData.get("confirmation") ?? "").trim() !== "DELETE") return { error: "Type DELETE to permanently delete this prayer point." };

  const { error } = await supabase.from("prayer_needs").delete().eq("id", prayer.id);
  if (error) return { error: "This prayer point could not be deleted." };
  revalidatePrayerPraise();
  redirect("/admin/prayer-and-praise?prayer=deleted");
}

export async function createPraiseReport(_: FormState, formData: FormData): Promise<FormState> {
  const { supabase } = await requireAdmin();
  const category = readCategory(formData);
  const summary = readSummary(formData);
  if (category.error) return category;
  if (summary.error) return summary;

  const { error } = await supabase
    .from("praise_reports")
    .insert({ category: category.value, public_summary: summary.value, status: "draft" });

  if (error) return { error: "This praise report could not be created." };
  revalidatePrayerPraise();
  redirect("/admin/prayer-and-praise?praise=saved");
}

export async function updatePraiseReport(id: string, _: FormState, formData: FormData): Promise<FormState> {
  const { supabase } = await requireAdmin();
  const praise = await loadPraise(supabase, id);
  if (!praise) return { error: "This praise report could not be found." };

  const category = readCategory(formData);
  const summary = readSummary(formData);
  if (category.error) return category;
  if (summary.error) return summary;

  const { error } = await supabase
    .from("praise_reports")
    .update({ category: category.value, public_summary: summary.value })
    .eq("id", praise.id);

  if (error) return { error: "This praise report could not be saved." };
  revalidatePrayerPraise();
  return { saved: true };
}

export async function publishPraiseReport(id: string, previousState: PrayerPraiseActionState): Promise<PrayerPraiseActionState> {
  void previousState;
  const { supabase } = await requireAdmin();
  const praise = await loadPraise(supabase, id);
  if (!praise) return { error: "This praise report could not be found." };
  if (praise.status !== "draft") return { error: "Only draft praise reports can be published." };

  const { error } = await supabase
    .from("praise_reports")
    .update({ status: "published", published_at: new Date().toISOString() })
    .eq("id", praise.id)
    .eq("status", "draft");

  if (error) return { error: "This praise report could not be published." };
  revalidatePrayerPraise();
  redirect("/admin/prayer-and-praise?praise=published");
}

export async function archivePraiseReport(id: string, previousState: PrayerPraiseActionState): Promise<PrayerPraiseActionState> {
  void previousState;
  const { supabase } = await requireAdmin();
  const praise = await loadPraise(supabase, id);
  if (!praise) return { error: "This praise report could not be found." };
  if (!["draft", "published"].includes(praise.status)) return { error: "This praise report cannot be archived." };

  const { error } = await supabase
    .from("praise_reports")
    .update({ status: "archived" })
    .eq("id", praise.id);

  if (error) return { error: "This praise report could not be archived." };
  revalidatePrayerPraise();
  redirect("/admin/prayer-and-praise?praise=archived");
}

export async function returnPraiseReportToDraft(id: string, previousState: PrayerPraiseActionState): Promise<PrayerPraiseActionState> {
  void previousState;
  const { supabase } = await requireAdmin();
  const praise = await loadPraise(supabase, id);
  if (!praise) return { error: "This praise report could not be found." };
  if (praise.status !== "archived") return { error: "Only archived praise reports can be returned to draft." };

  const { error } = await supabase
    .from("praise_reports")
    .update({ status: "draft", published_at: null })
    .eq("id", praise.id)
    .eq("status", "archived");

  if (error) return { error: "This praise report could not be returned to draft." };
  revalidatePrayerPraise();
  redirect("/admin/prayer-and-praise?praise=draft");
}

export async function deletePraiseReport(id: string, previousState: PrayerPraiseActionState, formData: FormData): Promise<PrayerPraiseActionState> {
  void previousState;
  const { supabase } = await requireAdmin();
  const praise = await loadPraise(supabase, id);
  if (!praise) return { error: "This praise report could not be found." };
  if (String(formData.get("confirmation") ?? "").trim() !== "DELETE") return { error: "Type DELETE to permanently delete this praise report." };

  const { error } = await supabase.from("praise_reports").delete().eq("id", praise.id);
  if (error) return { error: "This praise report could not be deleted." };
  revalidatePrayerPraise();
  redirect("/admin/prayer-and-praise?praise=deleted");
}
