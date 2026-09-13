"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isPointOfAgreementStatus, type PointsOfAgreementGuideSettings } from "@/lib/points-of-agreement";
import { requireAdmin } from "@/lib/supabase/admin";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TEXT_LIMITS = {
  title: 140,
  scripture: 4000,
  target: 3000,
  decree: 3000,
  additionalDirection: 3000,
  guideTitle: 140,
  guideSubtitle: 240,
  guideScripture: 2000,
  guideReference: 140,
  guideFooter: 2000,
};

type FormState = { error?: string; saved?: boolean };
export type PointActionState = { error?: string };
export type MovePointDirection = "up" | "down";

function revalidatePointsOfAgreement() {
  revalidatePath("/");
  revalidatePath("/points-of-agreement");
  revalidatePath("/admin");
  revalidatePath("/admin/points-of-agreement");
}

function readText(formData: FormData, name: string, label: string, maxLength: number, required = true) {
  const value = String(formData.get(name) ?? "").trim();
  if (required && !value) return { error: `${label} is required.` };
  if (value.length > maxLength) return { error: `${label} must be ${maxLength} characters or fewer.` };
  return { value };
}

function readExpirationDate(formData: FormData) {
  const value = String(formData.get("expiresOn") ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return { error: "Expiration date is required." };
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    return { error: "Choose a valid expiration date." };
  }
  return { value };
}

function readStatus(formData: FormData) {
  const value = String(formData.get("status") ?? "active").trim();
  if (!isPointOfAgreementStatus(value)) return { error: "Choose a valid status." };
  return { value };
}

function readPointFields(formData: FormData) {
  const point = readText(formData, "pointOfAgreement", "Point of Agreement", TEXT_LIMITS.title);
  const scripture = readText(formData, "scripture", "Scripture", TEXT_LIMITS.scripture);
  const target = readText(formData, "target", "Target", TEXT_LIMITS.target);
  const decree = readText(formData, "decree", "Decree", TEXT_LIMITS.decree);
  const additionalDirection = readText(formData, "additionalDirection", "Additional Direction", TEXT_LIMITS.additionalDirection, false);
  const expiresOn = readExpirationDate(formData);
  const status = readStatus(formData);
  const error = [point, scripture, target, decree, additionalDirection, expiresOn, status].find((field) => field.error)?.error;
  if (error) return { error };

  return {
    value: {
      point_of_agreement: point.value!,
      scripture: scripture.value!,
      target: target.value!,
      decree: decree.value!,
      additional_direction: additionalDirection.value || null,
      expires_on: expiresOn.value!,
      status: status.value!,
      archived_at: status.value === "archived" ? new Date().toISOString() : null,
    },
  };
}

function readGuideSettings(formData: FormData): { error?: string; value?: PointsOfAgreementGuideSettings } {
  const title = readText(formData, "title", "Title", TEXT_LIMITS.guideTitle);
  const subtitle = readText(formData, "subtitle", "Subtitle", TEXT_LIMITS.guideSubtitle);
  const openingScripture = readText(formData, "openingScripture", "Opening Scripture", TEXT_LIMITS.guideScripture);
  const openingReference = readText(formData, "openingScriptureReference", "Opening Scripture Reference", TEXT_LIMITS.guideReference);
  const footerQuotation = readText(formData, "footerQuotation", "Footer quotation", TEXT_LIMITS.guideFooter);
  const footerReference = readText(formData, "footerScriptureReference", "Footer Scripture Reference", TEXT_LIMITS.guideReference);
  const error = [title, subtitle, openingScripture, openingReference, footerQuotation, footerReference].find((field) => field.error)?.error;
  if (error) return { error };

  return {
    value: {
      title: title.value!,
      subtitle: subtitle.value!,
      opening_scripture: openingScripture.value!,
      opening_scripture_reference: openingReference.value!,
      footer_quotation: footerQuotation.value!,
      footer_scripture_reference: footerReference.value!,
    },
  };
}

async function loadPoint(supabase: Awaited<ReturnType<typeof requireAdmin>>["supabase"], id: string) {
  if (!UUID_PATTERN.test(id)) return null;
  const { data } = await supabase
    .from("points_of_agreement")
    .select("id, status")
    .eq("id", id)
    .maybeSingle();
  return data;
}

export async function updateGuideSettings(_: FormState, formData: FormData): Promise<FormState> {
  const { supabase } = await requireAdmin();
  const result = readGuideSettings(formData);
  if (result.error) return { error: result.error };
  if (!result.value) return { error: "Guide header and footer could not be saved." };

  const { error } = await supabase
    .from("points_of_agreement_guide_settings")
    .upsert({ id: true, ...result.value }, { onConflict: "id" });

  if (error) return { error: "Guide header and footer could not be saved." };
  revalidatePointsOfAgreement();
  return { saved: true };
}

export async function createPointOfAgreement(_: FormState, formData: FormData): Promise<FormState> {
  const { supabase } = await requireAdmin();
  const result = readPointFields(formData);
  if (result.error) return { error: result.error };
  if (!result.value) return { error: "This point could not be created." };

  const { error } = await supabase
    .rpc("admin_create_point_of_agreement", {
      p_point_of_agreement: result.value.point_of_agreement,
      p_scripture: result.value.scripture,
      p_target: result.value.target,
      p_decree: result.value.decree,
      p_additional_direction: result.value.additional_direction,
      p_expires_on: result.value.expires_on,
      p_status: result.value.status,
    });

  if (error) return { error: "This point could not be created." };
  revalidatePointsOfAgreement();
  redirect("/admin/points-of-agreement?point=created");
}

export async function updatePointOfAgreement(id: string, _: FormState, formData: FormData): Promise<FormState> {
  const { supabase } = await requireAdmin();
  const point = await loadPoint(supabase, id);
  if (!point) return { error: "This point could not be found." };

  const result = readPointFields(formData);
  if (result.error) return { error: result.error };
  if (!result.value) return { error: "This point could not be saved." };

  const { error } = await supabase
    .from("points_of_agreement")
    .update(result.value)
    .eq("id", point.id);

  if (error) return { error: "This point could not be saved." };
  revalidatePointsOfAgreement();
  return { saved: true };
}

export async function archivePointOfAgreement(id: string, previousState: PointActionState): Promise<PointActionState> {
  void previousState;
  const { supabase } = await requireAdmin();
  const point = await loadPoint(supabase, id);
  if (!point) return { error: "This point could not be found." };
  if (point.status !== "active") return { error: "Only active points can be archived." };

  const { error } = await supabase
    .from("points_of_agreement")
    .update({ status: "archived", archived_at: new Date().toISOString() })
    .eq("id", point.id)
    .eq("status", "active");

  if (error) return { error: "This point could not be archived." };
  revalidatePointsOfAgreement();
  redirect("/admin/points-of-agreement?point=archived");
}

export async function restorePointOfAgreement(id: string, previousState: PointActionState): Promise<PointActionState> {
  void previousState;
  const { supabase } = await requireAdmin();
  const point = await loadPoint(supabase, id);
  if (!point) return { error: "This point could not be found." };
  if (point.status !== "archived") return { error: "Only archived points can be restored." };

  const { error } = await supabase.rpc("admin_restore_point_of_agreement", { p_point_id: point.id });

  if (error) return { error: "This point could not be restored." };
  revalidatePointsOfAgreement();
  redirect("/admin/points-of-agreement?point=restored");
}

export async function movePointOfAgreement(id: string, direction: MovePointDirection, previousState: PointActionState): Promise<PointActionState> {
  void previousState;
  const { supabase } = await requireAdmin();
  if (!UUID_PATTERN.test(id)) return { error: "This point could not be found." };

  const { error } = await supabase.rpc("admin_move_point_of_agreement", {
    p_point_id: id,
    p_direction: direction,
  });

  if (error) return { error: direction === "up" ? "This point could not be moved up." : "This point could not be moved down." };
  revalidatePointsOfAgreement();
  redirect(`/admin/points-of-agreement?point=moved-${direction}`);
}

export async function deletePointOfAgreement(id: string, previousState: PointActionState, formData: FormData): Promise<PointActionState> {
  void previousState;
  const { supabase } = await requireAdmin();
  const point = await loadPoint(supabase, id);
  if (!point) return { error: "This point could not be found." };
  if (String(formData.get("confirmation") ?? "").trim() !== "DELETE") {
    return { error: "Type DELETE to permanently delete this point." };
  }

  const { error } = await supabase.from("points_of_agreement").delete().eq("id", point.id);
  if (error) return { error: "This point could not be deleted." };
  revalidatePointsOfAgreement();
  redirect("/admin/points-of-agreement?point=deleted");
}
