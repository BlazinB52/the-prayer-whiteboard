"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/supabase/admin";
import {
  PRINTABLE_PDF_BUCKET,
  isValidPdfMagicBytes,
  isValidPrintablePdfStoragePath,
  printablePdfStoragePath,
  validatePrintablePdfId,
  validatePrintablePdfTitle,
} from "@/lib/printable-pdf-links";

type PrintablePdfState = { error?: string; saved?: boolean; removed?: boolean };
type UploadTargetState = { error?: string; path?: string; token?: string };
type AdminSupabaseClient = Awaited<ReturnType<typeof requireAdmin>>["supabase"];

const VERIFY_FETCH_TIMEOUT_MS = 15_000;

function revalidatePrintablePdfPaths() {
  revalidatePath("/admin");
  revalidatePath("/admin/printable-pdfs");
  revalidatePath("/pdf");
}

export async function createPrintablePdfUploadTarget(): Promise<UploadTargetState> {
  const { supabase } = await requireAdmin();
  const path = printablePdfStoragePath(crypto.randomUUID());
  const { data, error } = await supabase.storage.from(PRINTABLE_PDF_BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { error: "The secure upload destination could not be created." };
  return { path, token: data.token };
}

export async function cleanupPrintablePdfUpload(path: string) {
  if (!isValidPrintablePdfStoragePath(path)) return;
  const { supabase } = await requireAdmin();
  await supabase.storage.from(PRINTABLE_PDF_BUCKET).remove([path]);
}

// Verifies the uploaded object is really a PDF by reading only its first
// bytes over HTTP (the bucket is public, so a plain Range request works),
// instead of supabase.storage.download(), which would pull the whole file
// through the Next.js server's memory and defeat the point of uploading
// directly from the browser to storage. Bounded by an explicit timeout so a
// slow or unresponsive fetch can never leave the save action hanging
// forever — it fails with a clear error the admin can retry instead.
async function verifyUploadedPdf(supabase: AdminSupabaseClient, path: string) {
  const { data } = supabase.storage.from(PRINTABLE_PDF_BUCKET).getPublicUrl(path);
  let response: Response;
  try {
    response = await fetch(data.publicUrl, {
      headers: { Range: "bytes=0-4" },
      signal: AbortSignal.timeout(VERIFY_FETCH_TIMEOUT_MS),
    });
  } catch {
    return false;
  }
  if (!response.ok || !response.body) return false;

  // Read directly off the stream and stop at 5 bytes, in case the server
  // doesn't honor the Range header and would otherwise send the full file.
  const reader = response.body.getReader();
  try {
    const collected: number[] = [];
    while (collected.length < 5) {
      const { done, value } = await reader.read();
      if (done) break;
      collected.push(...value);
    }
    return isValidPdfMagicBytes(new Uint8Array(collected));
  } finally {
    await reader.cancel().catch(() => {});
  }
}

async function removeStorageObject(supabase: AdminSupabaseClient, path: string) {
  await supabase.storage.from(PRINTABLE_PDF_BUCKET).remove([path]);
}

export async function savePrintablePdfLink(_: PrintablePdfState, formData: FormData): Promise<PrintablePdfState> {
  const title = validatePrintablePdfTitle(formData.get("title"));
  if (title.error || !title.value) {
    return { error: title.error ?? "Title is invalid." };
  }

  const rawStoragePath = formData.get("storagePath");
  const storagePath = typeof rawStoragePath === "string" ? rawStoragePath : "";
  if (!storagePath || !isValidPrintablePdfStoragePath(storagePath)) {
    return { error: "A PDF file is required." };
  }

  const { supabase } = await requireAdmin();

  if (!(await verifyUploadedPdf(supabase, storagePath))) {
    await removeStorageObject(supabase, storagePath);
    return { error: "The uploaded file is not a valid PDF." };
  }

  const { error } = await supabase.from("printable_pdf_links").insert({ title: title.value, storage_path: storagePath });

  if (error) {
    await removeStorageObject(supabase, storagePath);
    return { error: "Printable PDF link could not be saved." };
  }

  revalidatePrintablePdfPaths();
  return { saved: true };
}

export async function removePrintablePdfLink(id: string, previousState: PrintablePdfState): Promise<PrintablePdfState> {
  void previousState;
  const idResult = validatePrintablePdfId(id);
  if (idResult.error || !idResult.value) {
    return { error: idResult.error ?? "Printable PDF record ID is invalid." };
  }

  const { supabase } = await requireAdmin();

  const { data: existing } = await supabase
    .from("printable_pdf_links")
    .select("storage_path")
    .eq("id", idResult.value)
    .maybeSingle();

  const { error } = await supabase.from("printable_pdf_links").delete().eq("id", idResult.value);

  if (error) {
    return { error: "Printable PDF link could not be removed." };
  }

  if (existing?.storage_path) {
    await removeStorageObject(supabase, existing.storage_path);
  }

  revalidatePrintablePdfPaths();
  return { removed: true };
}
