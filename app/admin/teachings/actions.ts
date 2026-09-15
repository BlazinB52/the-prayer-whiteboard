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
export type DeleteTeachingState = { error?: string };

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

async function validateChalkboardSelection(
  supabase: Awaited<ReturnType<typeof requireAdmin>>["supabase"],
  formData: FormData,
) {
  const chalkboardAssetIds = Array.from(new Set(formData.getAll("chalkboardAssetIds").map((value) => String(value).trim()).filter(Boolean)));
  if (!chalkboardAssetIds.length) return { value: [] as string[] };
  if (chalkboardAssetIds.some((id) => !UUID_PATTERN.test(id))) return { error: "Choose valid chalkboards." };

  const { data: chalkboards, error } = await supabase
    .from("chalkboard_assets")
    .select("id, website_storage_path, storage_path")
    .in("id", chalkboardAssetIds)
    .eq("is_current_version", true)
    .eq("status", "active");
  if (error) return { error: "The selected chalkboards could not be verified." };
  if ((chalkboards ?? []).length !== chalkboardAssetIds.length) return { error: "Choose available chalkboards from the library." };
  if ((chalkboards ?? []).some((chalkboard) => !chalkboard.website_storage_path && !chalkboard.storage_path)) return { error: "Choose chalkboards with usable image files." };

  return { value: chalkboardAssetIds };
}

async function replaceTeachingChalkboards(
  supabase: Awaited<ReturnType<typeof requireAdmin>>["supabase"],
  teachingId: string,
  chalkboardAssetIds: string[],
) {
  const { error: deleteError } = await supabase.from("teaching_chalkboard_assignments").delete().eq("teaching_id", teachingId);
  if (deleteError) return { error: "This teaching's chalkboard assignments could not be updated." };
  if (!chalkboardAssetIds.length) return {};
  const { error: insertError } = await supabase.from("teaching_chalkboard_assignments").insert(chalkboardAssetIds.map((chalkboardAssetId, index) => ({
    teaching_id: teachingId,
    chalkboard_asset_id: chalkboardAssetId,
    display_order: index + 1,
  })));
  if (insertError) return { error: "This teaching's chalkboard assignments could not be saved." };
  return {};
}

async function readFooterAssignment(
  supabase: Awaited<ReturnType<typeof requireAdmin>>["supabase"],
  formData: FormData,
) {
  const includeFooter = formData.get("includeFooter") === "on" || formData.get("includeFooter") === "true";
  const footerId = String(formData.get("footerId") ?? "").trim();
  if (!includeFooter) return { value: null };
  if (!footerId) return { error: "Choose a footer or uncheck Include footer." };
  if (!UUID_PATTERN.test(footerId)) return { error: "Choose a valid footer." };
  const { data, error } = await supabase.from("content_footers").select("id").eq("id", footerId).eq("status", "active").maybeSingle();
  if (error) return { error: "The selected footer could not be verified." };
  if (!data) return { error: "Choose an active footer from the library." };
  return { value: footerId };
}

async function replaceTeachingFooter(
  supabase: Awaited<ReturnType<typeof requireAdmin>>["supabase"],
  teachingId: string,
  footerId: string | null,
) {
  const { error: deleteError } = await supabase.from("teaching_footer_assignments").delete().eq("teaching_id", teachingId);
  if (deleteError) return { error: "This teaching's footer assignment could not be updated." };
  if (!footerId) return {};
  const { error: insertError } = await supabase.from("teaching_footer_assignments").insert({ teaching_id: teachingId, footer_id: footerId });
  if (insertError) return { error: "This teaching's footer assignment could not be saved." };
  return {};
}

function revalidateTeachingDevotionalPaths(slug: string) {
  revalidatePath(`/teachings/${slug}/devotional`);
  for (let dayNumber = 1; dayNumber <= 7; dayNumber += 1) {
    revalidatePath(`/teachings/${slug}/devotional/day/${dayNumber}`);
  }
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

  const chalkboard = await validateChalkboardSelection(supabase, formData);
  if (chalkboard.error) return { error: chalkboard.error };
  const footer = await readFooterAssignment(supabase, formData);
  if (footer.error) return { error: footer.error };

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
        chalkboard_asset_id: chalkboard.value?.[0] ?? null,
      })
      .select("id")
      .single();

    if (!error && data) {
      const chalkboardResult = await replaceTeachingChalkboards(supabase, data.id, chalkboard.value ?? []);
      if (chalkboardResult.error) return { error: chalkboardResult.error };
      const footerResult = await replaceTeachingFooter(supabase, data.id, footer.value ?? null);
      if (footerResult.error) return { error: footerResult.error };
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

  const chalkboard = await validateChalkboardSelection(supabase, formData);
  if (chalkboard.error) return { error: chalkboard.error };
  const footer = await readFooterAssignment(supabase, formData);
  if (footer.error) return { error: footer.error };

  const { data, error } = await supabase
    .from("teachings")
    .update({ ...result.value, chalkboard_asset_id: chalkboard.value?.[0] ?? null })
    .eq("id", id)
    .in("status", ["draft", "published"])
    .select("id, slug")
    .maybeSingle();

  if (error || !data) {
    return { error: "This teaching could not be found or saved." };
  }
  const chalkboardResult = await replaceTeachingChalkboards(supabase, id, chalkboard.value ?? []);
  if (chalkboardResult.error) return { error: chalkboardResult.error };
  const footerResult = await replaceTeachingFooter(supabase, id, footer.value ?? null);
  if (footerResult.error) return { error: footerResult.error };

  revalidatePath(`/admin/teachings/${id}/edit`);
  revalidatePath(`/admin/teachings/${id}/devotional`);
  revalidatePath(`/admin/teachings/${id}/devotional/preview`);
  revalidatePath("/admin/teachings");
  revalidatePath(`/teachings/${data.slug}`);
  revalidateTeachingDevotionalPaths(data.slug);

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
    .in("status", ["draft", "published"])
    .maybeSingle();

  if (!teaching) {
    return { error: "Only draft or published teachings can be published and featured." };
  }

  const { error } = await supabase.rpc("publish_and_feature_teaching", { p_teaching_id: id });

  if (error) {
    return { error: error.message || "This teaching could not be published." };
  }

  revalidatePath("/");
  revalidatePath("/admin/teachings");
  revalidatePath(`/teachings/${teaching.slug}`);
  revalidateTeachingDevotionalPaths(teaching.slug);
  redirect("/admin/teachings?published=1");
}

export async function deleteTeaching(
  id: string,
  previousState: DeleteTeachingState,
  formData: FormData,
): Promise<DeleteTeachingState> {
  void previousState;
  const { supabase } = await requireAdmin();

  if (!UUID_PATTERN.test(id)) {
    return { error: "This teaching could not be found." };
  }

  if (String(formData.get("confirmation") ?? "").trim() !== "DELETE") {
    return { error: "Type DELETE to permanently delete this teaching." };
  }

  const { data: teaching } = await supabase
    .from("teachings")
    .select("id, slug")
    .eq("id", id)
    .in("status", ["draft", "published"])
    .maybeSingle();

  if (!teaching) {
    return { error: "This teaching could not be found." };
  }

  const { error: detachError } = await supabase.from("chalkboard_assets").update({ teaching_id: null, category_id: null, section_id: null }).eq("teaching_id", teaching.id);
  if (detachError) {
    return { error: "This teaching's chalkboard associations could not be detached." };
  }

  const { data: deleted, error: deleteError } = await supabase
    .from("teachings")
    .delete()
    .eq("id", teaching.id)
    .in("status", ["draft", "published"])
    .select("id")
    .maybeSingle();

  if (deleteError || !deleted) {
    return { error: "This teaching record could not be deleted. Please try again." };
  }

  revalidatePath("/");
  revalidatePath("/admin/teachings");
  revalidatePath(`/admin/teachings/${id}/edit`);
  revalidatePath(`/admin/teachings/${id}/devotional`);
  revalidatePath(`/admin/teachings/${id}/devotional/preview`);
  revalidatePath(`/teachings/${teaching.slug}`);
  revalidateTeachingDevotionalPaths(teaching.slug);
  revalidatePath("/admin/chalkboards");
  redirect("/admin/teachings?deleted=1");
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
  revalidateTeachingDevotionalPaths(teaching.slug);
  redirect("/admin/teachings?unpublished=1");
}
