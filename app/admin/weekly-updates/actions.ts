"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { convertDocxToWeeklyUpdate } from "@/lib/weekly-update-docx";
import { requireAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type FormState = { error?: string; saved?: boolean };
export type WeeklyUpdateActionState = { error?: string };
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;
const SOURCE_BUCKET = "weekly-update-documents";
const MAX_DOCX_BYTES = 8 * 1024 * 1024;

type AdminActionClient =
  | { supabase: Awaited<ReturnType<typeof createClient>>; error: null }
  | { supabase: null; error: string };

function cleanTitle(formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  if (!title || title.length > 180) return { error: "Title is required and must be 180 characters or fewer." };
  return { value: title };
}

function safeFileName(value: string) {
  const normalized = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120)
    .replace(/-+$/, "");
  return normalized.endsWith(".docx") ? normalized : `${normalized || "weekly-update"}.docx`;
}

async function readDocx(formData: FormData, required: boolean) {
  const file = formData.get("sourceDocument");
  if (!(file instanceof File) || !file.size) {
    return required ? { error: "Choose a .docx weekly update document." } : { empty: true as const };
  }

  const fileName = safeFileName(file.name);
  if (!fileName.endsWith(".docx")) return { error: "The weekly update document must be a .docx file." };
  if (file.size > MAX_DOCX_BYTES) return { error: "The .docx file must be 8 MiB or smaller." };

  const buffer = Buffer.from(await file.arrayBuffer());
  let converted: ReturnType<typeof convertDocxToWeeklyUpdate>;
  try {
    converted = convertDocxToWeeklyUpdate(buffer);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The .docx document could not be converted." };
  }

  return { value: { buffer, fileName, converted } };
}

function sourcePath(id: string, fileName: string) {
  return `weekly-updates/source-documents/${id}/${crypto.randomUUID()}-${fileName}`;
}

async function storeSourceDocument(
  supabase: Awaited<ReturnType<typeof requireAdmin>>["supabase"],
  id: string,
  fileName: string,
  buffer: Buffer,
) {
  const path = sourcePath(id, fileName);
  const { error } = await supabase.storage.from(SOURCE_BUCKET).upload(path, buffer, {
    contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    upsert: false,
  });
  if (error) return { error: "The source document could not be stored privately." };
  return { path };
}

function readWeeklyUpdateId(formData: FormData) {
  const value = String(formData.get("weeklyUpdateId") ?? "").trim();
  if (!value) return { error: "Missing weekly update ID." };
  if (!UUID_PATTERN.test(value)) return { error: "Invalid weekly update ID." };
  return { value };
}

async function getAdminActionClient(): Promise<AdminActionClient> {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError) return { supabase: null, error: `Administrator authentication failed: ${userError.message}` };
  if (!user) return { supabase: null, error: "Administrator authorization is required." };

  const { data: isAdmin, error: adminError } = await supabase.rpc("is_authenticated_admin");
  if (adminError) return { supabase: null, error: `Administrator authorization could not be verified: ${adminError.message}` };
  if (!isAdmin) return { supabase: null, error: "Administrator authorization is required." };

  return { supabase, error: null };
}

async function readWeeklyUpdateForStatusAction(
  supabase: Awaited<ReturnType<typeof createClient>>,
  id: string,
) {
  const { data, error } = await supabase
    .from("weekly_updates")
    .select("id, status")
    .eq("id", id)
    .maybeSingle();

  if (error) return { error: `Database lookup failed: ${error.message}` };
  if (!data) return { error: "Weekly update not found." };
  return { data };
}

export async function createWeeklyUpdate(_: FormState, formData: FormData): Promise<FormState> {
  const { supabase } = await requireAdmin();
  const title = cleanTitle(formData);
  if (title.error) return { error: title.error };
  if (!title.value) return { error: "Please check the weekly update details and try again." };

  const docx = await readDocx(formData, true);
  if (docx.error) return { error: docx.error };
  if (!docx.value) return { error: "Choose a .docx weekly update document." };

  const id = crypto.randomUUID();
  const stored = await storeSourceDocument(supabase, id, docx.value.fileName, docx.value.buffer);
  if (stored.error || !stored.path) return { error: stored.error ?? "The source document could not be stored privately." };

  const { data, error } = await supabase
    .from("weekly_updates")
    .insert({
      id,
      title: title.value,
      body_markdown: docx.value.converted.plainText,
      converted_content: docx.value.converted.blocks,
      source_document_storage_path: stored.path,
      source_document_file_name: docx.value.fileName,
      status: "draft",
      is_current: false,
    })
    .select("id")
    .single();
  if (error || !data) {
    await supabase.storage.from(SOURCE_BUCKET).remove([stored.path]);
    return { error: "The weekly update could not be created." };
  }

  revalidatePath("/admin/weekly-updates");
  redirect("/admin/weekly-updates?created=1");
}

export async function updateWeeklyUpdate(id: string, _: FormState, formData: FormData): Promise<FormState> {
  if (!UUID_PATTERN.test(id)) return { error: "This weekly update could not be found." };
  const { supabase } = await requireAdmin();
  const title = cleanTitle(formData);
  if (title.error) return { error: title.error };
  if (!title.value) return { error: "Please check the weekly update details and try again." };

  const docx = await readDocx(formData, false);
  if (docx.error) return { error: docx.error };

  const update: Record<string, unknown> = { title: title.value };
  let storedPath: string | null = null;
  if (docx.value) {
    const stored = await storeSourceDocument(supabase, id, docx.value.fileName, docx.value.buffer);
    if (stored.error || !stored.path) return { error: stored.error ?? "The source document could not be stored privately." };
    storedPath = stored.path;
    update.body_markdown = docx.value.converted.plainText;
    update.converted_content = docx.value.converted.blocks;
    update.source_document_storage_path = stored.path;
    update.source_document_file_name = docx.value.fileName;
  }

  const { data, error } = await supabase
    .from("weekly_updates")
    .update(update)
    .eq("id", id)
    .in("status", ["draft", "published"])
    .select("id")
    .maybeSingle();
  if (error || !data) {
    if (storedPath) await supabase.storage.from(SOURCE_BUCKET).remove([storedPath]);
    return { error: "The weekly update could not be saved." };
  }

  revalidatePath("/admin/weekly-updates");
  revalidatePath("/weekly-update");
  revalidatePath("/");
  return { saved: true };
}

export async function publishWeeklyUpdate(previousState: WeeklyUpdateActionState, formData: FormData): Promise<WeeklyUpdateActionState> {
  void previousState;
  const id = readWeeklyUpdateId(formData);
  if (id.error || !id.value) return { error: id.error ?? "Invalid weekly update ID." };
  const admin = await getAdminActionClient();
  if (!admin.supabase) return { error: admin.error };
  const { supabase } = admin;

  const existing = await readWeeklyUpdateForStatusAction(supabase, id.value);
  if (existing.error || !existing.data) return { error: existing.error ?? "Weekly update not found." };
  if (!["draft", "published"].includes(existing.data.status)) return { error: "Only draft or published weekly updates can be published." };

  const { error } = await supabase.rpc("publish_weekly_update", { p_weekly_update_id: id.value });
  if (error) return { error: `Weekly update publish failed: ${error.message}` };
  revalidatePath("/admin/weekly-updates");
  revalidatePath("/weekly-update");
  revalidatePath("/");
  redirect("/admin/weekly-updates?published=1");
}

export async function archiveWeeklyUpdate(previousState: WeeklyUpdateActionState, formData: FormData): Promise<WeeklyUpdateActionState> {
  void previousState;
  const id = readWeeklyUpdateId(formData);
  if (id.error || !id.value) return { error: id.error ?? "Invalid weekly update ID." };
  const admin = await getAdminActionClient();
  if (!admin.supabase) return { error: admin.error };
  const { supabase } = admin;

  const existing = await readWeeklyUpdateForStatusAction(supabase, id.value);
  if (existing.error || !existing.data) return { error: existing.error ?? "Weekly update not found." };
  if (!["draft", "published"].includes(existing.data.status)) return { error: "Only draft or published weekly updates can be archived." };

  const { data, error } = await supabase
    .from("weekly_updates")
    .update({ status: "archived", is_current: false, archived_at: new Date().toISOString() })
    .eq("id", id.value)
    .in("status", ["draft", "published"])
    .select("id")
    .maybeSingle();
  if (error) return { error: `Weekly update archive failed: ${error.message}` };
  if (!data) return { error: "Weekly update not found." };
  revalidatePath("/admin/weekly-updates");
  revalidatePath("/weekly-update");
  revalidatePath("/");
  redirect("/admin/weekly-updates?archived=1");
}
