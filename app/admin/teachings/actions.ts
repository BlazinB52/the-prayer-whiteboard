"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/supabase/admin";

const MAX_LENGTHS = {
  title: 160,
  centralTheme: 300,
  introduction: 5000,
  summary: 500,
};

type FormState = { error?: string; saved?: boolean };
export type PublishTeachingState = { error?: string };
export type UnpublishTeachingState = { error?: string };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function readText(formData: FormData, name: string, maxLength: number, required = false) {
  const value = String(formData.get(name) ?? "").trim();

  if (required && !value) {
    return { error: `${name === "title" ? "Title" : name} is required.` };
  }

  if (value.length > maxLength) {
    return {
      error: `${name === "centralTheme" ? "Central theme" : name} must be ${maxLength} characters or fewer.`,
    };
  }

  return { value };
}

function readDate(formData: FormData) {
  const value = String(formData.get("gatheringDate") ?? "").trim();

  if (!value) {
    return { value: null };
  }

  const parsed = new Date(`${value}T00:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    return { error: "Gathering date must be a valid date." };
  }

  return { value };
}

function slugify(title: string) {
  const slug = title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/, "");

  return slug || "teaching";
}

function validateMetadata(formData: FormData) {
  const fields = {
    title: readText(formData, "title", MAX_LENGTHS.title, true),
    centralTheme: readText(formData, "centralTheme", MAX_LENGTHS.centralTheme),
    introduction: readText(formData, "introduction", MAX_LENGTHS.introduction),
    summary: readText(formData, "summary", MAX_LENGTHS.summary),
    gatheringDate: readDate(formData),
  };

  const error = Object.values(fields).find((field) => field.error)?.error;
  if (error) {
    return { error };
  }

  return {
    value: {
      title: fields.title.value!,
      central_theme: fields.centralTheme.value || null,
      introduction: fields.introduction.value || null,
      summary: fields.summary.value || null,
      gathering_date: fields.gatheringDate.value,
    },
  };
}

export async function createTeaching(_: FormState, formData: FormData): Promise<FormState> {
  const { supabase } = await requireAdmin();
  const result = validateMetadata(formData);

  if (result.error) {
    return result;
  }

  if (!result.value) {
    return { error: "Please check the teaching details and try again." };
  }

  const baseSlug = slugify(result.value.title);

  for (let suffix = 0; suffix <= 99; suffix += 1) {
    const slug = suffix === 0 ? baseSlug : `${baseSlug}-${suffix}`;
    const { data, error } = await supabase
      .from("teachings")
      .insert({
        ...result.value,
        slug,
        status: "draft",
        is_featured: false,
        published_at: null,
      })
      .select("id")
      .single();

    if (!error && data) {
      redirect(`/admin/teachings/${data.id}/edit`);
    }

    if (error?.code !== "23505") {
      return { error: "This teaching could not be saved. Please try again." };
    }
  }

  return { error: "This teaching title is already in use. Please choose another title." };
}

export async function updateTeaching(
  id: string,
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  const { supabase } = await requireAdmin();

  if (!UUID_PATTERN.test(id)) {
    return { error: "This teaching could not be found." };
  }

  const result = validateMetadata(formData);
  if (result.error) {
    return result;
  }

  if (!result.value) {
    return { error: "Please check the teaching details and try again." };
  }

  const { data, error } = await supabase
    .from("teachings")
    .update(result.value)
    .eq("id", id)
    .in("status", ["draft", "published"])
    .select("id")
    .maybeSingle();

  if (error || !data) {
    return { error: "This teaching could not be found or saved." };
  }

  revalidatePath(`/admin/teachings/${id}/edit`);
  revalidatePath("/admin/teachings");

  if (formData.get("saveAction") === "return") {
    redirect("/admin/teachings?saved=1");
  }

  return { saved: true };
}

export async function publishAndFeatureTeaching(
  id: string,
  previousState: PublishTeachingState,
): Promise<PublishTeachingState> {
  void previousState;
  const { supabase } = await requireAdmin();

  if (!UUID_PATTERN.test(id)) {
    return { error: "This teaching could not be found." };
  }

  const { data: teaching } = await supabase
    .from("teachings")
    .select("slug")
    .eq("id", id)
    .eq("status", "draft")
    .maybeSingle();

  if (!teaching) {
    return { error: "Only draft teachings can be published and featured." };
  }

  const { error } = await supabase.rpc("publish_and_feature_teaching", { p_teaching_id: id });

  if (error) {
    return { error: error.message || "This teaching could not be published." };
  }

  revalidatePath("/");
  revalidatePath("/admin/teachings");
  revalidatePath(`/teachings/${teaching.slug}`);
  redirect("/admin/teachings?published=1");
}

export async function unpublishTeaching(
  id: string,
  previousState: UnpublishTeachingState,
): Promise<UnpublishTeachingState> {
  void previousState;
  const { supabase } = await requireAdmin();

  if (!UUID_PATTERN.test(id)) {
    return { error: "This teaching could not be found." };
  }

  const { data: teaching } = await supabase
    .from("teachings")
    .select("slug, status")
    .eq("id", id)
    .maybeSingle();

  if (!teaching) {
    return { error: "This teaching could not be found." };
  }

  if (teaching.status !== "published") {
    return { error: "Only published teachings can be unpublished." };
  }

  const { error } = await supabase
    .from("teachings")
    .update({ status: "draft", is_featured: false })
    .eq("id", id)
    .eq("status", "published");

  if (error) {
    return { error: "This teaching could not be unpublished." };
  }

  const { error: categoryError } = await supabase
    .from("teaching_categories")
    .update({ status: "draft" })
    .eq("teaching_id", id)
    .eq("status", "published");

  if (categoryError) {
    return { error: "This teaching's categories could not be unpublished." };
  }

  const { error: sectionError } = await supabase
    .from("teaching_sections")
    .update({ status: "draft" })
    .eq("teaching_id", id)
    .eq("status", "published");

  if (sectionError) {
    return { error: "This teaching's sections could not be unpublished." };
  }

  revalidatePath("/");
  revalidatePath("/admin/teachings");
  revalidatePath(`/admin/teachings/${id}/edit`);
  revalidatePath(`/teachings/${teaching.slug}`);
  redirect("/admin/teachings?unpublished=1");
}
