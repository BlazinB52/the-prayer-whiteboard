"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  AUTHORITY_PHOTO_BUCKET,
  AUTHORITY_PHOTO_MAX_BYTES,
  LEADER_LIMITS,
  MAX_ACTIVE_LEADERS,
  authorityPhotoStoragePath,
  isAuthorityPhotoPath,
  isJpegBytes,
} from "@/lib/those-in-authority";
import { requireContentManager } from "@/lib/supabase/admin";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACTIVE_LIMIT_MESSAGE = `${MAX_ACTIVE_LEADERS} leaders are already active. Turn one off before activating another.`;
const EDITOR_PATH = "/admin/cm/those-in-authority";

export type LeaderFormState = { error?: string; saved?: boolean };
export type LeaderActionState = { error?: string };
export type MoveLeaderDirection = "up" | "down";

type Supabase = Awaited<ReturnType<typeof requireContentManager>>["supabase"];

function revalidateLeaders() {
  revalidatePath("/those-in-authority");
  revalidatePath(EDITOR_PATH);
}

function readText(formData: FormData, name: string, label: string, maxLength: number, required = true) {
  const value = String(formData.get(name) ?? "").replace(/\r\n/g, "\n").trim();
  if (required && !value) return { error: `${label} is required.` };
  if (value.length > maxLength) return { error: `${label} must be ${maxLength} characters or fewer.` };
  return { value };
}

function readLeaderFields(formData: FormData) {
  const name = readText(formData, "name", "Name", LEADER_LIMITS.name);
  const title = readText(formData, "title", "Title", LEADER_LIMITS.title);
  const reference = readText(formData, "scriptureReference", "Scripture reference", LEADER_LIMITS.scriptureReference);
  const scriptureText = readText(formData, "scriptureText", "Scripture text", LEADER_LIMITS.scriptureText, false);
  const prayer = readText(formData, "prayer", "Prayer", LEADER_LIMITS.prayer);
  const photoAlt = readText(formData, "photoAlt", "Photo description", LEADER_LIMITS.photoAlt, false);
  const error = [name, title, reference, scriptureText, prayer, photoAlt].find((field) => field.error)?.error;
  if (error) return { error };

  return {
    value: {
      name: name.value!,
      title: title.value!,
      scripture_reference: reference.value!,
      scripture_text: scriptureText.value || null,
      prayer: prayer.value!,
      photo_alt: photoAlt.value || null,
      is_active: formData.get("isActive") === "on",
    },
  };
}

// The browser crops and re-encodes the photo to a small square JPEG before
// sending it. Check it here anyway: size, type, and the JPEG file signature.
async function readPhoto(formData: FormData): Promise<{ error?: string; bytes?: Uint8Array }> {
  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) return {};
  if (file.size > AUTHORITY_PHOTO_MAX_BYTES) return { error: "The photo is too large. Try cropping it again." };
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!isJpegBytes(bytes)) return { error: "The photo could not be read. Choose a JPG, PNG, or WebP image and crop it again." };
  return { bytes };
}

async function uploadPhoto(supabase: Supabase, bytes: Uint8Array) {
  const path = authorityPhotoStoragePath(crypto.randomUUID());
  const { error } = await supabase.storage.from(AUTHORITY_PHOTO_BUCKET).upload(path, bytes, {
    contentType: "image/jpeg",
    cacheControl: "31536000",
    upsert: false,
  });
  return error ? null : path;
}

async function removePhoto(supabase: Supabase, path: string | null | undefined) {
  if (isAuthorityPhotoPath(path)) {
    await supabase.storage.from(AUTHORITY_PHOTO_BUCKET).remove([path]);
  }
}

async function loadLeader(supabase: Supabase, id: string) {
  if (!UUID_PATTERN.test(id)) return null;
  const { data } = await supabase
    .from("authority_leaders")
    .select("id, is_active, photo_path")
    .eq("id", id)
    .maybeSingle();
  return data as { id: string; is_active: boolean; photo_path: string | null } | null;
}

async function activeCount(supabase: Supabase, excludeId?: string) {
  let query = supabase.from("authority_leaders").select("id", { count: "exact", head: true }).eq("is_active", true);
  if (excludeId) query = query.neq("id", excludeId);
  const { count } = await query;
  return count ?? 0;
}

function isActiveLimitError(error: { message?: string } | null) {
  return Boolean(error?.message?.includes("authority_leaders_active_limit"));
}

export async function createLeader(_: LeaderFormState, formData: FormData): Promise<LeaderFormState> {
  const { supabase } = await requireContentManager();
  const fields = readLeaderFields(formData);
  if (fields.error || !fields.value) return { error: fields.error ?? "This leader could not be added." };

  if (fields.value.is_active && (await activeCount(supabase)) >= MAX_ACTIVE_LEADERS) {
    return { error: ACTIVE_LIMIT_MESSAGE };
  }

  const photo = await readPhoto(formData);
  if (photo.error) return { error: photo.error };

  let photoPath: string | null = null;
  if (photo.bytes) {
    photoPath = await uploadPhoto(supabase, photo.bytes);
    if (!photoPath) return { error: "The photo could not be uploaded. Try again." };
  }

  const { error } = await supabase.from("authority_leaders").insert({ ...fields.value, photo_path: photoPath });
  if (error) {
    await removePhoto(supabase, photoPath);
    return { error: isActiveLimitError(error) ? ACTIVE_LIMIT_MESSAGE : "This leader could not be added." };
  }

  revalidateLeaders();
  redirect(`${EDITOR_PATH}?leader=created`);
}

export async function updateLeader(id: string, _: LeaderFormState, formData: FormData): Promise<LeaderFormState> {
  const { supabase } = await requireContentManager();
  const leader = await loadLeader(supabase, id);
  if (!leader) return { error: "This leader could not be found." };

  const fields = readLeaderFields(formData);
  if (fields.error || !fields.value) return { error: fields.error ?? "This leader could not be saved." };

  if (fields.value.is_active && !leader.is_active && (await activeCount(supabase, leader.id)) >= MAX_ACTIVE_LEADERS) {
    return { error: ACTIVE_LIMIT_MESSAGE };
  }

  const { error } = await supabase.from("authority_leaders").update(fields.value).eq("id", leader.id);
  if (error) return { error: isActiveLimitError(error) ? ACTIVE_LIMIT_MESSAGE : "This leader could not be saved." };

  revalidateLeaders();
  return { saved: true };
}

// Adds or swaps the photo without touching the rest of the entry.
export async function replaceLeaderPhoto(id: string, _: LeaderFormState, formData: FormData): Promise<LeaderFormState> {
  const { supabase } = await requireContentManager();
  const leader = await loadLeader(supabase, id);
  if (!leader) return { error: "This leader could not be found." };

  const photo = await readPhoto(formData);
  if (photo.error) return { error: photo.error };
  if (!photo.bytes) return { error: "Choose a photo and crop it first." };

  const newPath = await uploadPhoto(supabase, photo.bytes);
  if (!newPath) return { error: "The photo could not be uploaded. Try again." };

  const { error } = await supabase.from("authority_leaders").update({ photo_path: newPath }).eq("id", leader.id);
  if (error) {
    await removePhoto(supabase, newPath);
    return { error: "The photo could not be saved." };
  }

  await removePhoto(supabase, leader.photo_path);
  revalidateLeaders();
  return { saved: true };
}

// Removes only the photo. The entry then shows "No photo available".
export async function removeLeaderPhoto(id: string, previousState: LeaderActionState): Promise<LeaderActionState> {
  void previousState;
  const { supabase } = await requireContentManager();
  const leader = await loadLeader(supabase, id);
  if (!leader) return { error: "This leader could not be found." };
  if (!leader.photo_path) return { error: "This leader has no photo." };

  const { error } = await supabase.from("authority_leaders").update({ photo_path: null }).eq("id", leader.id);
  if (error) return { error: "The photo could not be removed." };

  await removePhoto(supabase, leader.photo_path);
  revalidateLeaders();
  redirect(`${EDITOR_PATH}?leader=photo-removed`);
}

export async function moveLeader(id: string, direction: MoveLeaderDirection, previousState: LeaderActionState): Promise<LeaderActionState> {
  void previousState;
  const { supabase } = await requireContentManager();
  if (!UUID_PATTERN.test(id)) return { error: "This leader could not be found." };

  const { error } = await supabase.rpc("admin_move_authority_leader", { p_leader_id: id, p_direction: direction });
  if (error) return { error: direction === "up" ? "This leader could not be moved up." : "This leader could not be moved down." };

  revalidateLeaders();
  redirect(`${EDITOR_PATH}?leader=moved-${direction}`);
}

export async function deleteLeader(id: string, previousState: LeaderActionState): Promise<LeaderActionState> {
  void previousState;
  const { supabase } = await requireContentManager();
  const leader = await loadLeader(supabase, id);
  if (!leader) return { error: "This leader could not be found." };

  const { error } = await supabase.from("authority_leaders").delete().eq("id", leader.id);
  if (error) return { error: "This leader could not be deleted." };

  await removePhoto(supabase, leader.photo_path);
  revalidateLeaders();
  redirect(`${EDITOR_PATH}?leader=deleted`);
}
