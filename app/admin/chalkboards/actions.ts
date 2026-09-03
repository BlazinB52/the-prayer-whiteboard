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
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const INCOMING_PATH_PATTERN = new RegExp(`^teachings/([0-9a-f-]{36})/chalkboards/([0-9a-f-]{36})/v1/incoming\\.(jpg|jpeg|png|webp)$`, "i");

export type ChalkboardActionState = { error?: string; saved?: boolean; path?: string; token?: string; assetGroupId?: string };
type UploadActionState = ChalkboardActionState;

type FinalizeInput = {
  teachingId: string;
  assetGroupId: string;
  incomingPath: string;
  title: string;
  altText: string;
  caption: string;
  categoryId: string;
  sectionId: string;
  includeInPrint: boolean;
  allowDownload: boolean;
};

function validId(value: string) {
  return UUID_PATTERN.test(value);
}

function cleanText(value: string, maxLength: number) {
  const text = value.trim();
  return text && text.length <= maxLength ? text : null;
}

function extensionForFile(fileName: string) {
  const extension = fileName.toLowerCase().split(".").pop();
  return extension === "jpg" || extension === "jpeg" || extension === "png" || extension === "webp" ? extension : null;
}

function safePaths(teachingId: string, assetGroupId: string) {
  const base = `teachings/${teachingId}/chalkboards/${assetGroupId}/v1`;
  return {
    incoming: `${base}/incoming`,
    website: `${base}/website.webp`,
    download: `${base}/download.jpg`,
  };
}

async function loadSharp() {
  const sharp = (await import("sharp")).default;
  return sharp;
}

async function removeObjects(supabase: Awaited<ReturnType<typeof requireAdmin>>["supabase"], paths: string[]) {
  const existing = paths.filter(Boolean);
  if (existing.length) await supabase.storage.from(BUCKET).remove(existing);
}

export async function createChalkboardUploadTarget(teachingId: string, fileName: string): Promise<UploadActionState> {
  if (!validId(teachingId)) return { error: "Choose a valid teaching." };
  const extension = extensionForFile(fileName);
  if (!extension) return { error: "Choose a JPEG, PNG, or WebP image." };

  const { supabase } = await requireAdmin();
  const { data: teaching } = await supabase.from("teachings").select("id").eq("id", teachingId).eq("status", "draft").maybeSingle();
  if (!teaching) return { error: "Only draft teachings can receive new chalkboards." };

  const assetGroupId = crypto.randomUUID();
  const path = `${safePaths(teachingId, assetGroupId).incoming}.${extension}`;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { error: "The secure upload destination could not be created." };
  return { path, token: data.token, assetGroupId };
}

export async function cleanupChalkboardUpload(teachingId: string, assetGroupId: string, incomingPath: string) {
  if (!validId(teachingId) || !validId(assetGroupId)) return;
  const match = INCOMING_PATH_PATTERN.exec(incomingPath);
  if (!match || match[1].toLowerCase() !== teachingId.toLowerCase() || match[2].toLowerCase() !== assetGroupId.toLowerCase()) return;
  const { supabase } = await requireAdmin();
  await removeObjects(supabase, [incomingPath]);
}

export async function finalizeChalkboardUpload(input: FinalizeInput): Promise<UploadActionState> {
  const title = cleanText(input.title, 160);
  const altText = cleanText(input.altText, 500);
  const caption = input.caption.trim();
  if (!validId(input.teachingId) || !validId(input.assetGroupId)) return { error: "The teaching or asset identifier is invalid." };
  if (!title) return { error: "Chalkboard title is required and must be 160 characters or fewer." };
  if (!altText) return { error: "Alternative text is required and must be 500 characters or fewer." };
  if (caption.length > 500) return { error: "Caption must be 500 characters or fewer." };
  if (input.categoryId && !validId(input.categoryId)) return { error: "The selected category is invalid." };
  if (input.sectionId && !validId(input.sectionId)) return { error: "The selected section is invalid." };

  const match = INCOMING_PATH_PATTERN.exec(input.incomingPath);
  if (!match || match[1].toLowerCase() !== input.teachingId.toLowerCase() || match[2].toLowerCase() !== input.assetGroupId.toLowerCase()) {
    return { error: "The secure upload path is invalid." };
  }

  const { supabase } = await requireAdmin();
  const { data: teaching } = await supabase.from("teachings").select("id").eq("id", input.teachingId).eq("status", "draft").maybeSingle();
  if (!teaching) return { error: "Only draft teachings can receive new chalkboards." };

  if (input.sectionId) {
    const { data: section } = await supabase.from("teaching_sections").select("id, category_id").eq("id", input.sectionId).eq("category_id", input.categoryId).eq("teaching_id", input.teachingId).eq("status", "draft").maybeSingle();
    if (!section) return { error: "The selected section does not belong to the selected draft teaching and category." };
  } else if (input.categoryId) {
    const { data: category } = await supabase.from("teaching_categories").select("id").eq("id", input.categoryId).eq("teaching_id", input.teachingId).eq("status", "draft").maybeSingle();
    if (!category) return { error: "The selected category does not belong to the selected draft teaching." };
  }

  const paths = safePaths(input.teachingId, input.assetGroupId);
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
    return { error: `Use a portrait 3:4 image at least 1080 × 1440. This file is ${width || "unknown"} × ${height || "unknown"} (${metadata.format ?? "unknown format"}).` };
  }

  try {
    const website = await image.clone().resize(WEBSITE_WIDTH, WEBSITE_HEIGHT, { fit: "fill" }).webp({ quality: 84 }).toBuffer();
    const download = await image.clone().resize(DOWNLOAD_WIDTH, DOWNLOAD_HEIGHT, { fit: "fill" }).jpeg({ quality: 91, chromaSubsampling: "4:4:4" }).toBuffer();
    const websiteUpload = await supabase.storage.from(BUCKET).upload(paths.website, website, { contentType: "image/webp", upsert: false });
    if (websiteUpload.error) throw new Error("website");
    const downloadUpload = await supabase.storage.from(BUCKET).upload(paths.download, download, { contentType: "image/jpeg", upsert: false });
    if (downloadUpload.error) throw new Error("download");

    const { data: existing } = await supabase.from("chalkboard_assets").select("id").eq("website_storage_path", paths.website).maybeSingle();
    if (existing) throw new Error("duplicate");

    const placementQuery = supabase.from("chalkboard_assets").select("display_order").eq("teaching_id", input.teachingId).eq("is_current_version", true).eq("status", "active");
    const { data: placedAssets } = input.sectionId
      ? await placementQuery.eq("section_id", input.sectionId)
      : input.categoryId
        ? await placementQuery.eq("category_id", input.categoryId).is("section_id", null)
        : await placementQuery.is("category_id", null).is("section_id", null);
    const displayOrder = Math.max(0, ...(placedAssets ?? []).map((asset) => asset.display_order ?? 0)) + 1;

    const { error: insertError } = await supabase.from("chalkboard_assets").insert({
      teaching_id: input.teachingId,
      asset_group_id: input.assetGroupId,
      category_id: input.categoryId || null,
      section_id: input.sectionId || null,
      storage_path: input.incomingPath,
      title,
      alt_text: altText,
      caption: caption || null,
      website_storage_path: paths.website,
      download_storage_path: paths.download,
      display_order: displayOrder,
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

export async function updateChalkboardDetails(assetId: string, _: ChalkboardActionState, formData: FormData): Promise<ChalkboardActionState> {
  if (!validId(assetId)) return { error: "This chalkboard could not be found." };
  const title = cleanText(String(formData.get("title") ?? ""), 160);
  const altText = cleanText(String(formData.get("altText") ?? ""), 500);
  const caption = String(formData.get("caption") ?? "").trim();
  if (!title) return { error: "Chalkboard title is required and must be 160 characters or fewer." };
  if (!altText) return { error: "Alternative text is required and must be 500 characters or fewer." };
  if (caption.length > 500) return { error: "Caption must be 500 characters or fewer." };

  const { supabase } = await requireAdmin();
  const { data: asset } = await supabase.from("chalkboard_assets").select("id, teaching_id, download_storage_path").eq("id", assetId).maybeSingle();
  if (!asset) return { error: "This chalkboard could not be found." };
  const { data: teaching } = await supabase.from("teachings").select("id").eq("id", asset.teaching_id).maybeSingle();
  if (!teaching) return { error: "This chalkboard is not attached to a valid teaching." };
  const allowDownload = formData.get("allowDownload") === "on" || formData.get("allowDownload") === "true";
  if (allowDownload && !asset.download_storage_path) return { error: "Public download cannot be enabled because this chalkboard has no download file." };

  const { data, error } = await supabase.from("chalkboard_assets").update({ title, alt_text: altText, caption: caption || null, include_in_print: formData.get("includeInPrint") === "on" || formData.get("includeInPrint") === "true", allow_download: allowDownload }).eq("id", assetId).eq("teaching_id", teaching.id).select("id").maybeSingle();
  if (error || !data) return { error: "The chalkboard details could not be saved." };
  revalidatePath("/admin/chalkboards");
  return { saved: true };
}
