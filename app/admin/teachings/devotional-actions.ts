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
export type DevotionalAssignmentState = { error?: string };

function readText(formData: FormData, name: string, maxLength: number, required = false) {
  const value = String(formData.get(name) ?? "").trim();
  if (required && !value) return { error: `${name} is required.` };
  if (value.length > maxLength) return { error: `${name} must be ${maxLength} characters or fewer.` };
  return { value };
}

// Shared day-field validation, used by both the teaching-scoped and the
// standalone day editors.
function readDayFields(formData: FormData) {
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

  return {
    values: {
      title: title.value || "",
      anchor_scriptures: anchorScriptures,
      devotional_reading: devotionalReading.value || null,
      confession: confession.value || null,
      journal_prompt: journalPrompt.value || null,
      prayer_activation: prayerActivation.value || null,
    },
  };
}

// Shared import-file reading, used by both import actions.
async function readImportedDevotionalFile(formData: FormData) {
  const file = formData.get("devotionalFile");
  if (!(file instanceof File) || !file.name) {
    return { error: "Choose a devotional text file to import." };
  }
  if (file.size > MAX_IMPORT_FILE_SIZE) {
    return { error: "The devotional text file must be 250 KB or smaller." };
  }

  try {
    return { imported: parseDevotionalText(await file.text()) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The devotional text file could not be parsed." };
  }
}

function slugifyDevotionalTitle(title: string) {
  const slug = title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/, "");

  return slug || "devotional";
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

async function getAssignedDevotional(supabase: Awaited<ReturnType<typeof requireAdmin>>["supabase"], teachingId: string) {
  const { data: assignment, error: assignmentError } = await supabase
    .from("teaching_devotional_assignments")
    .select("devotional_id")
    .eq("teaching_id", teachingId)
    .maybeSingle();
  if (assignmentError || !assignment) return { devotional: null, error: assignmentError };

  const { data: devotional, error } = await supabase
    .from("teaching_devotionals")
    .select("id, teaching_id, slug, title, introduction, status, published_at")
    .eq("id", assignment.devotional_id)
    .maybeSingle();
  return { devotional, error };
}

async function saveAssignment(supabase: Awaited<ReturnType<typeof requireAdmin>>["supabase"], teachingId: string, devotionalId: string) {
  return supabase
    .from("teaching_devotional_assignments")
    .upsert({ teaching_id: teachingId, devotional_id: devotionalId }, { onConflict: "teaching_id" });
}

function revalidateDevotionalPaths(teachingId: string, teachingSlug: string, devotionalSlug = teachingSlug) {
  revalidatePath("/");
  revalidatePath("/devotionals");
  revalidatePath("/devotionals/start");
  revalidatePath(`/devotionals/${devotionalSlug}`);
  revalidatePath(`/devotionals/${devotionalSlug}/start`);
  revalidatePath("/admin/teachings");
  revalidatePath("/admin/devotionals");
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

  const { devotional: assigned } = await getAssignedDevotional(supabase, teaching.id);
  if (assigned) {
    redirect(`/admin/teachings/${teaching.id}/devotional`);
  }

  // `unique (teaching_id)` is gone, so this lookup can legitimately match more
  // than one row and maybeSingle() would error instead of returning one.
  const { data: ownedRows } = await supabase
    .from("teaching_devotionals")
    .select("id")
    .eq("teaching_id", teaching.id)
    .order("created_at", { ascending: true })
    .limit(1);
  const existing = ownedRows?.[0] ?? null;

  if (existing) {
    const { error } = await saveAssignment(supabase, teaching.id, existing.id);
    if (error) return { error: "This devotional could not be assigned." };
    revalidateDevotionalPaths(teaching.id, teaching.slug);
    redirect(`/admin/teachings/${teaching.id}/devotional?assigned=1`);
  }

  const { data: created, error } = await supabase
    .from("teaching_devotionals")
    .insert({ teaching_id: teaching.id, slug: teaching.slug, title: `${teaching.title} 7-Day Devotional`, status: "draft", published_at: null })
    .select("id")
    .single();

  if (error || !created) return { error: "This devotional could not be created." };
  const { error: assignmentError } = await saveAssignment(supabase, teaching.id, created.id);
  if (assignmentError) {
    await supabase.from("teaching_devotionals").delete().eq("id", created.id);
    return { error: "This devotional could not be assigned." };
  }
  revalidateDevotionalPaths(teaching.id, teaching.slug);
  redirect(`/admin/teachings/${teaching.id}/devotional?created=1`);
}

export async function assignExistingDevotional(teachingId: string, previousState: DevotionalAssignmentState, formData: FormData): Promise<DevotionalAssignmentState> {
  void previousState;
  const { supabase } = await requireAdmin();
  const teaching = await getTeaching(supabase, teachingId);
  if (!teaching) return { error: "This teaching could not be found." };

  const devotionalId = String(formData.get("devotionalId") ?? "");
  if (!UUID_PATTERN.test(devotionalId)) return { error: "Choose a devotional to assign." };
  const { data: devotional } = await supabase
    .from("teaching_devotionals")
    .select("id, slug")
    .eq("id", devotionalId)
    .maybeSingle();
  if (!devotional) return { error: "This devotional could not be found." };

  const { error } = await saveAssignment(supabase, teaching.id, devotional.id);
  if (error) return { error: "This devotional could not be assigned." };
  revalidateDevotionalPaths(teaching.id, teaching.slug, devotional.slug || teaching.slug);
  redirect(`/admin/teachings/${teaching.id}/devotional?assigned=1`);
}

export async function removeDevotionalAssignment(teachingId: string, previousState: DevotionalAssignmentState): Promise<DevotionalAssignmentState> {
  void previousState;
  const { supabase } = await requireAdmin();
  const teaching = await getTeaching(supabase, teachingId);
  if (!teaching) return { error: "This teaching could not be found." };
  const { devotional } = await getAssignedDevotional(supabase, teaching.id);

  const { error } = await supabase
    .from("teaching_devotional_assignments")
    .delete()
    .eq("teaching_id", teaching.id);
  if (error) return { error: "This devotional assignment could not be removed." };
  revalidateDevotionalPaths(teaching.id, teaching.slug, devotional?.slug || teaching.slug);
  redirect(`/admin/teachings/${teaching.id}/devotional?removed=1`);
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

  const { devotional } = await getAssignedDevotional(supabase, teaching.id);

  if (!devotional) return { error: "Create the devotional before saving series information." };

  const { error } = await supabase
    .from("teaching_devotionals")
    .update({ title: title.value, introduction: introduction.value || null })
    .eq("id", devotional.id);

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

  const day = readDayFields(formData);
  if (day.error) return { error: day.error };

  const { devotional } = await getAssignedDevotional(supabase, teaching.id);

  if (!devotional) return { error: "Create the devotional before saving day content." };

  const { error } = await supabase
    .from("teaching_devotional_days")
    .upsert({
      devotional_id: devotional.id,
      day_number: dayNumber,
      ...day.values,
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

  const file = await readImportedDevotionalFile(formData);
  if (file.error || !file.imported) return { error: file.error ?? "The devotional text file could not be parsed." };
  const imported = file.imported;

  const assignedResult = await getAssignedDevotional(supabase, teaching.id);
  if (assignedResult.error) return { error: "This devotional could not be checked before import." };
  let existing = assignedResult.devotional;

  if (!existing) {
    // Same as createDevotional: teaching_id is no longer unique, so take the
    // oldest owned row rather than asking maybeSingle() for at most one.
    const { data: ownedRows, error: ownedError } = await supabase
      .from("teaching_devotionals")
      .select("id, teaching_id, slug, title, introduction, status, published_at")
      .eq("teaching_id", teaching.id)
      .order("created_at", { ascending: true })
      .limit(1);
    if (ownedError) return { error: "This devotional could not be checked before import." };
    existing = ownedRows?.[0] ?? null;
    if (existing) {
      const { error } = await saveAssignment(supabase, teaching.id, existing.id);
      if (error) return { error: "This devotional could not be assigned before import." };
    }
  }

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
      .eq("id", devotionalId);
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
    const { error: assignmentError } = await saveAssignment(supabase, teaching.id, devotionalId);
    if (assignmentError) {
      await supabase.from("teaching_devotionals").delete().eq("id", devotionalId);
      return { error: "The imported devotional could not be assigned." };
    }
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

  const { devotional } = await getAssignedDevotional(supabase, teaching.id);

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
    .eq("id", devotional.id);

  if (error) return { error: "This devotional could not be published." };
  revalidateDevotionalPaths(teaching.id, teaching.slug, devotional.slug || teaching.slug);
  redirect(`/admin/teachings/${teaching.id}/devotional?published=1`);
}

export async function unpublishDevotional(teachingId: string, previousState: DevotionalPublishState): Promise<DevotionalPublishState> {
  void previousState;
  const { supabase } = await requireAdmin();
  const teaching = await getTeaching(supabase, teachingId);
  if (!teaching) return { error: "This teaching could not be found." };

  const { devotional } = await getAssignedDevotional(supabase, teaching.id);

  if (!devotional) return { error: "This devotional could not be found." };

  const { error } = await supabase
    .from("teaching_devotionals")
    .update({ status: "draft", published_at: null })
    .eq("id", devotional.id);

  if (error) return { error: "This devotional could not be unpublished." };
  revalidateDevotionalPaths(teaching.id, teaching.slug, devotional.slug || teaching.slug);
  redirect(`/admin/teachings/${teaching.id}/devotional?unpublished=1`);
}

// ---------------------------------------------------------------------------
// Standalone devotionals
//
// These act on a devotional id directly instead of a teaching id, so they work
// for a devotional that has no teaching context at all. A standalone devotional
// stores teaching_id as null and is invisible to the public until it is
// assigned to a published teaching through teaching_devotional_assignments.
// ---------------------------------------------------------------------------

const PROVISIONAL_SLUG_ATTEMPTS = 100;

function revalidateStandaloneDevotionalPaths(devotionalId: string, devotionalSlug?: string | null) {
  revalidatePath("/admin/devotionals");
  revalidatePath(`/admin/devotionals/${devotionalId}`);
  revalidatePath(`/admin/devotionals/${devotionalId}/preview`);
  if (devotionalSlug) {
    revalidatePath("/devotionals");
    revalidatePath(`/devotionals/${devotionalSlug}`);
    revalidatePath(`/devotionals/${devotionalSlug}/start`);
  }
}

async function getDevotionalById(supabase: Awaited<ReturnType<typeof requireAdmin>>["supabase"], devotionalId: string) {
  if (!UUID_PATTERN.test(devotionalId)) return null;
  const { data } = await supabase
    .from("teaching_devotionals")
    .select("id, teaching_id, slug, title, introduction, status, published_at")
    .eq("id", devotionalId)
    .maybeSingle();
  return data;
}

export async function createStandaloneDevotional(previousState: DevotionalFormState, formData: FormData): Promise<DevotionalFormState> {
  void previousState;
  const { supabase } = await requireAdmin();

  const title = readText(formData, "title", MAX_LENGTHS.title, true);
  if (title.error || !title.value) return { error: title.error ?? "A devotional title is required." };
  const introduction = readText(formData, "introduction", MAX_LENGTHS.introduction);
  if (introduction.error) return introduction;
  const titleValue = title.value;

  // Provisional slug only. It is derived from the title now and can be replaced
  // before publishing; the partial unique index ignores blank slugs but still
  // rejects duplicate real ones, so retry on 23505 the way createTeaching does.
  const baseSlug = slugifyDevotionalTitle(titleValue);
  let createdId: string | null = null;
  let createdSlug: string | null = null;

  for (let suffix = 0; suffix < PROVISIONAL_SLUG_ATTEMPTS; suffix += 1) {
    const slug = suffix === 0 ? baseSlug : `${baseSlug}-${suffix + 1}`;
    const { data, error } = await supabase
      .from("teaching_devotionals")
      .insert({
        teaching_id: null,
        slug,
        title: titleValue,
        introduction: introduction.value || null,
        status: "draft",
        published_at: null,
      })
      .select("id, slug")
      .single();

    if (!error && data) {
      createdId = data.id as string;
      createdSlug = data.slug as string;
      break;
    }

    if (error?.code !== "23505") {
      return { error: "This devotional could not be created." };
    }
  }

  if (!createdId) {
    return { error: "This devotional title is already in use. Please choose another title." };
  }

  revalidateStandaloneDevotionalPaths(createdId, createdSlug);
  redirect(`/admin/devotionals/${createdId}?created=1`);
}

export async function updateStandaloneDevotionalSeries(devotionalId: string, previousState: DevotionalFormState, formData: FormData): Promise<DevotionalFormState> {
  void previousState;
  const { supabase } = await requireAdmin();
  const devotional = await getDevotionalById(supabase, devotionalId);
  if (!devotional) return { error: "This devotional could not be found." };

  const title = readText(formData, "title", MAX_LENGTHS.title, true);
  const introduction = readText(formData, "introduction", MAX_LENGTHS.introduction);
  if (title.error) return title;
  if (introduction.error) return introduction;

  const { error } = await supabase
    .from("teaching_devotionals")
    .update({ title: title.value, introduction: introduction.value || null })
    .eq("id", devotional.id);

  if (error) return { error: "The devotional series information could not be saved." };
  revalidateStandaloneDevotionalPaths(devotional.id, devotional.slug);
  return { saved: true };
}

export async function updateStandaloneDevotionalDay(devotionalId: string, dayNumber: number, previousState: DevotionalFormState, formData: FormData): Promise<DevotionalFormState> {
  void previousState;
  const { supabase } = await requireAdmin();
  if (!Number.isInteger(dayNumber) || dayNumber < 1 || dayNumber > 7) return { error: "Day number must be between 1 and 7." };

  const day = readDayFields(formData);
  if (day.error) return { error: day.error };

  const devotional = await getDevotionalById(supabase, devotionalId);
  if (!devotional) return { error: "This devotional could not be found." };

  const { error } = await supabase
    .from("teaching_devotional_days")
    .upsert({
      devotional_id: devotional.id,
      day_number: dayNumber,
      ...day.values,
    }, { onConflict: "devotional_id,day_number" });

  if (error) return { error: `Day ${dayNumber} could not be saved.` };
  revalidateStandaloneDevotionalPaths(devotional.id, devotional.slug);
  return { saved: true };
}

export async function importStandaloneDevotionalText(devotionalId: string, previousState: DevotionalImportState, formData: FormData): Promise<DevotionalImportState> {
  void previousState;
  const { supabase } = await requireAdmin();
  const devotional = await getDevotionalById(supabase, devotionalId);
  if (!devotional) return { error: "This devotional could not be found." };

  if (devotional.status === "published") {
    return { error: "Unpublish this devotional before replacing it with an import." };
  }

  const file = await readImportedDevotionalFile(formData);
  if (file.error || !file.imported) return { error: file.error ?? "The devotional text file could not be parsed." };
  const imported = file.imported;

  // The existing slug is deliberately left alone. It is already a working
  // public identifier and rewriting it here would break any link to it.
  const { error: seriesError } = await supabase
    .from("teaching_devotionals")
    .update({
      title: imported.title,
      introduction: imported.introduction || null,
      status: "draft",
      published_at: null,
    })
    .eq("id", devotional.id);

  if (seriesError) return { error: "The devotional series information could not be imported." };

  const { error: daysError } = await supabase
    .from("teaching_devotional_days")
    .upsert(
      imported.days.map((day) => ({
        devotional_id: devotional.id,
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
  revalidateStandaloneDevotionalPaths(devotional.id, devotional.slug);
  redirect(`/admin/devotionals/${devotional.id}?imported=1`);
}
