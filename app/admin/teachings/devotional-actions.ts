"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { parseDevotionalText } from "@/lib/devotional-import";
import { findDevotionalPublishBlocker, formatAnchorScriptureLengthLimit, MAX_ANCHOR_SCRIPTURE_LENGTH, normalizeScriptureLines } from "@/lib/devotionals";
import { requireAdmin } from "@/lib/supabase/admin";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_LENGTHS = {
  title: 180,
  introduction: 8000,
  reading: 12000,
  short: 3000,
};
const MAX_IMPORT_FILE_SIZE = 250_000;

export type DevotionalFormState = { error?: string; saved?: boolean };
export type DevotionalImportState = { error?: string };
export type DevotionalPublishState = { error?: string };

function readText(formData: FormData, name: string, maxLength: number, required = false) {
  const value = String(formData.get(name) ?? "").trim();
  if (required && !value) return { error: `${name} is required.` };
  if (value.length > maxLength) return { error: `${name} must be ${maxLength} characters or fewer.` };
  return { value };
}

async function getTeaching(supabase: Awaited<ReturnType<typeof requireAdmin>>["supabase"], teachingId: string) {
  if (!UUID_PATTERN.test(teachingId)) return null;
  const { data } = await supabase
    .from("teachings")
    .select("id, slug, title, status")
    .eq("id", teachingId)
    .in("status", ["draft", "published"])
    .maybeSingle();
  return data;
}

function revalidateDevotionalPaths(teachingId: string, teachingSlug: string, devotionalSlug = teachingSlug) {
  revalidatePath("/");
  revalidatePath("/devotionals");
  revalidatePath("/devotionals/start");
  revalidatePath(`/devotionals/${devotionalSlug}`);
  revalidatePath(`/devotionals/${devotionalSlug}/start`);
  revalidatePath("/admin/teachings");
  revalidatePath(`/admin/teachings/${teachingId}/edit`);
  revalidatePath(`/admin/teachings/${teachingId}/devotional`);
  revalidatePath(`/admin/teachings/${teachingId}/devotional/preview`);
  revalidatePath(`/teachings/${teachingSlug}`);
  revalidatePath(`/teachings/${teachingSlug}/devotional`);
  for (let dayNumber = 1; dayNumber <= 7; dayNumber += 1) {
    revalidatePath(`/teachings/${teachingSlug}/devotional/day/${dayNumber}`);
  }
}

export async function createDevotional(teachingId: string, previousState: DevotionalFormState): Promise<DevotionalFormState> {
  void previousState;
  const { supabase } = await requireAdmin();
  const teaching = await getTeaching(supabase, teachingId);
  if (!teaching) return { error: "This teaching could not be found." };

  const { data: existing } = await supabase
    .from("teaching_devotionals")
    .select("id")
    .eq("teaching_id", teaching.id)
    .maybeSingle();

  if (existing) {
    redirect(`/admin/teachings/${teaching.id}/devotional`);
  }

  const { error } = await supabase
    .from("teaching_devotionals")
    .insert({ teaching_id: teaching.id, slug: teaching.slug, title: `${teaching.title} 7-Day Devotional`, status: "draft", published_at: null });

  if (error) return { error: "This devotional could not be created." };
  revalidateDevotionalPaths(teaching.id, teaching.slug);
  redirect(`/admin/teachings/${teaching.id}/devotional?created=1`);
}

export async function updateDevotionalSeries(teachingId: string, previousState: DevotionalFormState, formData: FormData): Promise<DevotionalFormState> {
  void previousState;
  const { supabase } = await requireAdmin();
  const teaching = await getTeaching(supabase, teachingId);
  if (!teaching) return { error: "This teaching could not be found." };

  const title = readText(formData, "title", MAX_LENGTHS.title, true);
  const introduction = readText(formData, "introduction", MAX_LENGTHS.introduction);
  if (title.error) return title;
  if (introduction.error) return introduction;

  const { data: devotional } = await supabase
    .from("teaching_devotionals")
    .select("id, teaching_id, slug")
    .eq("teaching_id", teaching.id)
    .maybeSingle();

  if (!devotional) return { error: "Create the devotional before saving series information." };

  const { error } = await supabase
    .from("teaching_devotionals")
    .update({ title: title.value, introduction: introduction.value || null })
    .eq("id", devotional.id)
    .eq("teaching_id", teaching.id);

  if (error) return { error: "The devotional series information could not be saved." };
  revalidateDevotionalPaths(teaching.id, teaching.slug, devotional.slug || teaching.slug);
  return { saved: true };
}

export async function updateDevotionalDay(teachingId: string, dayNumber: number, previousState: DevotionalFormState, formData: FormData): Promise<DevotionalFormState> {
  void previousState;
  const { supabase } = await requireAdmin();
  const teaching = await getTeaching(supabase, teachingId);
  if (!teaching) return { error: "This teaching could not be found." };
  if (!Number.isInteger(dayNumber) || dayNumber < 1 || dayNumber > 7) return { error: "Day number must be between 1 and 7." };

  const title = readText(formData, "title", MAX_LENGTHS.title);
  const devotionalReading = readText(formData, "devotionalReading", MAX_LENGTHS.reading);
  const confession = readText(formData, "confession", MAX_LENGTHS.short);
  const journalPrompt = readText(formData, "journalPrompt", MAX_LENGTHS.short);
  const prayerActivation = readText(formData, "prayerActivation", MAX_LENGTHS.short);
  const textError = [title, devotionalReading, confession, journalPrompt, prayerActivation].find((field) => field.error)?.error;
  if (textError) return { error: textError };

  const anchorScriptures = normalizeScriptureLines(formData.get("anchorScriptures"));
  if (anchorScriptures.length > 20) return { error: "Anchor Scriptures must include 20 references or fewer." };
  if (anchorScriptures.some((scripture) => scripture.length > MAX_ANCHOR_SCRIPTURE_LENGTH)) return { error: `Each anchor Scripture must be ${formatAnchorScriptureLengthLimit()} characters or fewer.` };

  const { data: devotional } = await supabase
    .from("teaching_devotionals")
    .select("id, teaching_id, slug")
    .eq("teaching_id", teaching.id)
    .maybeSingle();

  if (!devotional) return { error: "Create the devotional before saving day content." };

  const { error } = await supabase
    .from("teaching_devotional_days")
    .upsert({
      devotional_id: devotional.id,
      day_number: dayNumber,
      title: title.value || "",
      anchor_scriptures: anchorScriptures,
      devotional_reading: devotionalReading.value || null,
      confession: confession.value || null,
      journal_prompt: journalPrompt.value || null,
      prayer_activation: prayerActivation.value || null,
    }, { onConflict: "devotional_id,day_number" });

  if (error) return { error: `Day ${dayNumber} could not be saved.` };
  revalidateDevotionalPaths(teaching.id, teaching.slug, devotional.slug || teaching.slug);
  return { saved: true };
}

export async function importDevotionalText(teachingId: string, previousState: DevotionalImportState, formData: FormData): Promise<DevotionalImportState> {
  void previousState;
  const { supabase } = await requireAdmin();
  const teaching = await getTeaching(supabase, teachingId);
  if (!teaching) return { error: "This teaching could not be found." };

  const file = formData.get("devotionalFile");
  if (!(file instanceof File) || !file.name) {
    return { error: "Choose a devotional text file to import." };
  }
  if (file.size > MAX_IMPORT_FILE_SIZE) {
    return { error: "The devotional text file must be 250 KB or smaller." };
  }

  let imported;
  try {
    imported = parseDevotionalText(await file.text());
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The devotional text file could not be parsed." };
  }

  const { data: existing, error: existingError } = await supabase
    .from("teaching_devotionals")
    .select("id, teaching_id, slug, status")
    .eq("teaching_id", teaching.id)
    .maybeSingle();

  if (existingError) return { error: "This devotional could not be checked before import." };
  if (existing?.status === "published") {
    return { error: "Unpublish this devotional before replacing it with an import." };
  }

  let devotionalId = existing?.id as string | undefined;
  if (devotionalId) {
    const { error } = await supabase
      .from("teaching_devotionals")
      .update({
        title: imported.title,
        introduction: imported.introduction || null,
        slug: existing?.slug || teaching.slug,
        status: "draft",
        published_at: null,
      })
      .eq("id", devotionalId)
      .eq("teaching_id", teaching.id);
    if (error) return { error: "The devotional series information could not be imported." };
  } else {
    const { data, error } = await supabase
      .from("teaching_devotionals")
      .insert({
        teaching_id: teaching.id,
        slug: teaching.slug,
        title: imported.title,
        introduction: imported.introduction || null,
        status: "draft",
        published_at: null,
      })
      .select("id")
      .single();
    if (error || !data) return { error: "The devotional could not be created from the import." };
    devotionalId = data.id as string;
  }

  const { error: daysError } = await supabase
    .from("teaching_devotional_days")
    .upsert(
      imported.days.map((day) => ({
        devotional_id: devotionalId,
        day_number: day.day_number,
        title: day.title,
        anchor_scriptures: day.anchor_scriptures,
        devotional_reading: day.devotional_reading,
        confession: day.confession,
        journal_prompt: day.journal_prompt,
        prayer_activation: day.prayer_activation,
      })),
      { onConflict: "devotional_id,day_number" },
    );

  if (daysError) return { error: "The devotional days could not be imported." };
  revalidateDevotionalPaths(teaching.id, teaching.slug, existing?.slug || teaching.slug);
  redirect(`/admin/teachings/${teaching.id}/devotional?imported=1`);
}

export async function publishDevotional(teachingId: string, previousState: DevotionalPublishState): Promise<DevotionalPublishState> {
  void previousState;
  const { supabase } = await requireAdmin();
  const teaching = await getTeaching(supabase, teachingId);
  if (!teaching) return { error: "This teaching could not be found." };

  const { data: devotional } = await supabase
    .from("teaching_devotionals")
    .select("id, teaching_id, slug, title, introduction, status, published_at")
    .eq("teaching_id", teaching.id)
    .maybeSingle();

  if (!devotional) return { error: "Create the devotional before publishing." };

  const { data: days, error: daysError } = await supabase
    .from("teaching_devotional_days")
    .select("id, devotional_id, day_number, title, anchor_scriptures, devotional_reading, confession, journal_prompt, prayer_activation")
    .eq("devotional_id", devotional.id)
    .order("day_number", { ascending: true });

  if (daysError) return { error: "Devotional days could not be checked." };
  const blocker = findDevotionalPublishBlocker(devotional, days ?? []);
  if (blocker) return { error: blocker };

  const { error } = await supabase
    .from("teaching_devotionals")
    .update({ slug: devotional.slug || teaching.slug, status: "published", published_at: new Date().toISOString() })
    .eq("id", devotional.id)
    .eq("teaching_id", teaching.id);

  if (error) return { error: "This devotional could not be published." };
  revalidateDevotionalPaths(teaching.id, teaching.slug, devotional.slug || teaching.slug);
  redirect(`/admin/teachings/${teaching.id}/devotional?published=1`);
}

export async function unpublishDevotional(teachingId: string, previousState: DevotionalPublishState): Promise<DevotionalPublishState> {
  void previousState;
  const { supabase } = await requireAdmin();
  const teaching = await getTeaching(supabase, teachingId);
  if (!teaching) return { error: "This teaching could not be found." };

  const { data: devotional } = await supabase
    .from("teaching_devotionals")
    .select("id, teaching_id, slug")
    .eq("teaching_id", teaching.id)
    .maybeSingle();

  if (!devotional) return { error: "This devotional could not be found." };

  const { error } = await supabase
    .from("teaching_devotionals")
    .update({ status: "draft", published_at: null })
    .eq("id", devotional.id)
    .eq("teaching_id", teaching.id);

  if (error) return { error: "This devotional could not be unpublished." };
  revalidateDevotionalPaths(teaching.id, teaching.slug, devotional.slug || teaching.slug);
  redirect(`/admin/teachings/${teaching.id}/devotional?unpublished=1`);
}
