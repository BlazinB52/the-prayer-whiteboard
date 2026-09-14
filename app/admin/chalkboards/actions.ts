"use server";

import { revalidatePath } from "next/cache";
import type { Metadata, Sharp } from "sharp";
import { requireAdmin } from "@/lib/supabase/admin";

const BUCKET = "chalkboards";
const MAX_SOURCE_BYTES = 15 * 1024 * 1024;
const MIN_WIDTH = 1080;
const MIN_HEIGHT = 1440;
const WEBSITE_WIDTH = 1080;
const WEBSITE_HEIGHT = 1440;
const DOWNLOAD_WIDTH = 2160;
const DOWNLOAD_HEIGHT = 2880;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const INCOMING_PATH_PATTERN = /^library\/(\d{8})\/([^/]+)\/([0-9a-f-]{36})\/v1\/incoming\.(jpg|jpeg|png|webp)$/i;

export type ChalkboardActionState = { error?: string; saved?: boolean; deleted?: boolean; path?: string; token?: string; assetGroupId?: string };
type UploadActionState = ChalkboardActionState & { canonicalName?: string };

type FinalizeInput = {
  assetGroupId: string;
  incomingPath: string;
  chalkboardDate: string;
  chalkboardTitle: string;
  altText: string;
  caption: string;
  includeInPrint: boolean;
  allowDownload: boolean;
};

function validId(value: string) {
  return UUID_PATTERN.test(value);
}

function cleanText(value: string, maxLength: number) {
  const text = value.trim().replace(/\s+/g, " ");
  return text && text.length <= maxLength ? text : null;
}

function readDate(value: string) {
  const text = value.trim();
  if (!DATE_PATTERN.test(text)) return null;
  const parsed = new Date(`${text}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== text ? null : text;
}

function compactDate(value: string) {
  return value.replaceAll("-", "");
}

function slugify(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/, "") || "chalkboard";
}

function buildNames(chalkboardDate: string, chalkboardTitle: string) {
  const date = readDate(chalkboardDate);
  const title = cleanText(chalkboardTitle, 160);
  if (!date || !title) return null;
  const dateKey = compactDate(date);
  return {
    date,
    dateKey,
    title,
    canonicalName: `${dateKey}_${title}`,
    storageSlug: `${dateKey}_${slugify(title)}`,
  };
}

function extensionForFile(fileName: string) {
  const extension = fileName.toLowerCase().split(".").pop();
  return extension === "jpg" || extension === "jpeg" || extension === "png" || extension === "webp" ? extension : null;
}

function safePaths(storageSlug: string, assetGroupId: string) {
  const base = `library/${storageSlug}/${assetGroupId}/v1`;
  return {
    incoming: `${base}/incoming`,
    website: `${base}/website.webp`,
    download: `${base}/download.png`,
  };
}

async function loadSharp() {
  const sharp = (await import("sharp")).default;
  return sharp;
}

async function removeObjects(supabase: Awaited<ReturnType<typeof requireAdmin>>["supabase"], paths: string[]) {
  const existing = Array.from(new Set(paths.filter(Boolean)));
  if (existing.length) await supabase.storage.from(BUCKET).remove(existing);
}

export async function createChalkboardUploadTarget(chalkboardDate: string, chalkboardTitle: string, fileName: string): Promise<UploadActionState> {
  const names = buildNames(chalkboardDate, chalkboardTitle);
  if (!names) return { error: "Enter a valid chalkboard date and title." };
  const extension = extensionForFile(fileName);
  if (!extension) return { error: "Choose a JPEG, PNG, or WebP image." };

  const { supabase } = await requireAdmin();
  const assetGroupId = crypto.randomUUID();
  const path = `${safePaths(names.storageSlug, assetGroupId).incoming}.${extension}`;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { error: "The secure upload destination could not be created." };
  return { path, token: data.token, assetGroupId, canonicalName: names.canonicalName };
}

export async function cleanupChalkboardUpload(assetGroupId: string, incomingPath: string) {
  if (!validId(assetGroupId)) return;
  const match = INCOMING_PATH_PATTERN.exec(incomingPath);
  if (!match || match[3].toLowerCase() !== assetGroupId.toLowerCase()) return;
  const { supabase } = await requireAdmin();
  await removeObjects(supabase, [incomingPath]);
}

export async function finalizeChalkboardUpload(input: FinalizeInput): Promise<UploadActionState> {
  const names = buildNames(input.chalkboardDate, input.chalkboardTitle);
  const altText = cleanText(input.altText, 500);
  const caption = input.caption.trim();
  if (!names || !validId(input.assetGroupId)) return { error: "The chalkboard date, title, or asset identifier is invalid." };
  if (!altText) return { error: "Alternative text is required and must be 500 characters or fewer." };
  if (caption.length > 500) return { error: "Caption must be 500 characters or fewer." };

  const match = INCOMING_PATH_PATTERN.exec(input.incomingPath);
  if (!match || match[1] !== names.dateKey || match[2] !== names.storageSlug || match[3].toLowerCase() !== input.assetGroupId.toLowerCase()) {
    return { error: "The secure upload path is invalid." };
  }

  const { supabase } = await requireAdmin();
  const paths = safePaths(names.storageSlug, input.assetGroupId);
  const { data: source, error: downloadError } = await supabase.storage.from(BUCKET).download(input.incomingPath);
  if (downloadError || !source) return { error: "The uploaded image could not be read from private storage." };
  const sourceBuffer = Buffer.from(await source.arrayBuffer());
  if (sourceBuffer.byteLength > MAX_SOURCE_BYTES) {
    await removeObjects(supabase, [input.incomingPath]);
    return { error: "The source image exceeds the 15 MiB limit." };
  }

  let image: Sharp;
  let metadata: Metadata;
  try {
    const sharp = await loadSharp();
    image = sharp(sourceBuffer).rotate();
    metadata = await image.metadata();
  } catch {
    await removeObjects(supabase, [input.incomingPath]);
    return { error: "The uploaded file is not a readable image." };
  }

  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  const ratio = height ? width / height : 0;
  if (!metadata.format || !["jpeg", "png", "webp"].includes(metadata.format) || width < MIN_WIDTH || height < MIN_HEIGHT || Math.abs(ratio - 0.75) > 0.001) {
    await removeObjects(supabase, [input.incomingPath]);
    return { error: `Use a portrait 3:4 image at least 1080 x 1440. This file is ${width || "unknown"} x ${height || "unknown"} (${metadata.format ?? "unknown format"}).` };
  }

  try {
    const website = await image.clone().resize(WEBSITE_WIDTH, WEBSITE_HEIGHT, { fit: "fill" }).webp({ quality: 84 }).toBuffer();
    const download = await image.clone().resize(DOWNLOAD_WIDTH, DOWNLOAD_HEIGHT, { fit: "fill" }).png({ compressionLevel: 9 }).toBuffer();
    const websiteUpload = await supabase.storage.from(BUCKET).upload(paths.website, website, { contentType: "image/webp", upsert: false });
    if (websiteUpload.error) throw new Error("website");
    const downloadUpload = await supabase.storage.from(BUCKET).upload(paths.download, download, { contentType: "image/png", upsert: false });
    if (downloadUpload.error) throw new Error("download");

    const { data: existing } = await supabase.from("chalkboard_assets").select("id").eq("website_storage_path", paths.website).maybeSingle();
    if (existing) throw new Error("duplicate");

    const { error: insertError } = await supabase.from("chalkboard_assets").insert({
      teaching_id: null,
      asset_group_id: input.assetGroupId,
      category_id: null,
      section_id: null,
      storage_path: input.incomingPath,
      title: names.title,
      canonical_name: names.canonicalName,
      chalkboard_date: names.date,
      alt_text: altText,
      caption: caption || null,
      website_storage_path: paths.website,
      download_storage_path: paths.download,
      display_order: 1,
      include_in_print: input.includeInPrint,
      allow_download: input.allowDownload,
      width: DOWNLOAD_WIDTH,
      height: DOWNLOAD_HEIGHT,
      version_number: 1,
      is_current_version: true,
      status: "active",
    });
    if (insertError) throw new Error("metadata");
  } catch (error) {
    await removeObjects(supabase, [input.incomingPath, paths.website, paths.download]);
    return { error: error instanceof Error && error.message === "duplicate" ? "This chalkboard upload already exists." : "The chalkboard could not be finalized. No metadata record was saved." };
  }

  await removeObjects(supabase, [input.incomingPath]);
  revalidatePath("/admin/chalkboards");
  return { saved: true };
}

export async function getChalkboardPreviewUrl(path: string) {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 300);
  return error ? null : data.signedUrl;
}

export async function updateChalkboardDetails(_: ChalkboardActionState, formData: FormData): Promise<ChalkboardActionState> {
  const assetId = String(formData.get("chalkboardId") ?? "").trim();
  if (!validId(assetId)) return { error: "This chalkboard could not be found." };
  const names = buildNames(String(formData.get("chalkboardDate") ?? ""), String(formData.get("title") ?? ""));
  const altText = cleanText(String(formData.get("altText") ?? ""), 500);
  const caption = String(formData.get("caption") ?? "").trim();
  if (!names) return { error: "Enter a valid chalkboard date and title." };
  if (!altText) return { error: "Alternative text is required and must be 500 characters or fewer." };
  if (caption.length > 500) return { error: "Caption must be 500 characters or fewer." };

  const { supabase } = await requireAdmin();
  const { data: asset } = await supabase.from("chalkboard_assets").select("id, download_storage_path").eq("id", assetId).eq("status", "active").maybeSingle();
  if (!asset) return { error: "This chalkboard could not be found." };
  const allowDownload = formData.get("allowDownload") === "on" || formData.get("allowDownload") === "true";
  if (allowDownload && !asset.download_storage_path) return { error: "Public download cannot be enabled because this chalkboard has no download file." };

  const { data, error } = await supabase.from("chalkboard_assets").update({
    title: names.title,
    canonical_name: names.canonicalName,
    chalkboard_date: names.date,
    alt_text: altText,
    caption: caption || null,
    include_in_print: formData.get("includeInPrint") === "on" || formData.get("includeInPrint") === "true",
    allow_download: allowDownload,
  }).eq("id", assetId).select("id").maybeSingle();
  if (error || !data) return { error: "The chalkboard details could not be saved." };
  revalidatePath("/admin/chalkboards");
  revalidatePath("/admin/teachings");
  revalidatePath("/");
  return { saved: true };
}

export async function deleteChalkboard(assetId: string, _: ChalkboardActionState, formData: FormData): Promise<ChalkboardActionState> {
  if (!validId(assetId)) return { error: "This chalkboard could not be found." };
  if (String(formData.get("confirmation") ?? "").trim() !== "DELETE") {
    return { error: "Type DELETE to permanently delete this chalkboard." };
  }

  const { supabase } = await requireAdmin();
  const { data: asset } = await supabase
    .from("chalkboard_assets")
    .select("id, storage_path, website_storage_path, download_storage_path, tv_storage_path")
    .eq("id", assetId)
    .maybeSingle();
  if (!asset) return { error: "This chalkboard could not be found." };

  const paths = [asset.storage_path, asset.website_storage_path, asset.download_storage_path, asset.tv_storage_path].filter((path): path is string => Boolean(path));
  const { error: unlinkError } = await supabase.from("teachings").update({ chalkboard_asset_id: null }).eq("chalkboard_asset_id", assetId);
  if (unlinkError) return { error: "This chalkboard could not be detached from teachings." };

  const { error: storageError } = await supabase.storage.from(BUCKET).remove(paths);
  if (storageError) return { error: "This chalkboard was not deleted because one or more files could not be removed." };

  const { data: deleted, error: deleteError } = await supabase.from("chalkboard_assets").delete().eq("id", assetId).select("id").maybeSingle();
  if (deleteError || !deleted) return { error: "The chalkboard files were removed, but the metadata record could not be deleted. Please contact an administrator before retrying." };

  revalidatePath("/admin/chalkboards");
  revalidatePath("/admin/teachings");
  revalidatePath("/");
  return { deleted: true };
}
