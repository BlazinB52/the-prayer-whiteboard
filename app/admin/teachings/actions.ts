"use server";

import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/supabase/admin";

const MAX_LENGTHS = {
  title: 160,
  centralTheme: 240,
  introduction: 5000,
  summary: 500,
};

type FormState = { error?: string; saved?: boolean };

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

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
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
    .eq("status", "draft")
    .select("id")
    .maybeSingle();

  if (error || !data) {
    return { error: "This teaching could not be found or saved." };
  }

  if (formData.get("saveAction") === "return") {
    redirect("/admin/teachings?saved=1");
  }

  return { saved: true };
}
