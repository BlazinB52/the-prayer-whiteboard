"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/supabase/admin";
import { getTeachingLookupErrorCategory, validatePrintablePdfUrl, validateTeachingId } from "@/lib/printable-pdf-links";

type PrintablePdfState = { error?: string; saved?: boolean; removed?: boolean };

function revalidatePrintablePdfPaths() {
  revalidatePath("/admin");
  revalidatePath("/admin/printable-pdfs");
}

export async function savePrintablePdfLink(_: PrintablePdfState, formData: FormData): Promise<PrintablePdfState> {
  const teachingIdResult = validateTeachingId(formData.get("teachingId"));
  if (teachingIdResult.error || !teachingIdResult.value) {
    return { error: teachingIdResult.error ?? "Teaching ID is invalid." };
  }
  const teachingId = teachingIdResult.value;

  const url = validatePrintablePdfUrl(String(formData.get("printablePdfUrl") ?? ""));
  if (url.error || !url.value) {
    return { error: url.error ?? "Printable PDF URL is invalid." };
  }

  const { supabase } = await requireAdmin();
  const { data: teaching, error: teachingError } = await supabase
    .from("teachings")
    .select("id")
    .eq("id", teachingId)
    .maybeSingle();

  if (teachingError) {
    return { error: `Teaching lookup failed: ${getTeachingLookupErrorCategory(teachingError.code)}.` };
  }

  if (!teaching) {
    return { error: "Teaching could not be found." };
  }

  const { error } = await supabase
    .from("teaching_printable_pdf_links")
    .upsert({ teaching_id: teachingId, printable_pdf_url: url.value }, { onConflict: "teaching_id" });

  if (error) {
    return { error: "PDF assignment save failed." };
  }

  revalidatePrintablePdfPaths();
  return { saved: true };
}

export async function removePrintablePdfLink(teachingId: string, previousState: PrintablePdfState): Promise<PrintablePdfState> {
  void previousState;
  const teachingIdResult = validateTeachingId(teachingId);
  if (teachingIdResult.error || !teachingIdResult.value) {
    return { error: teachingIdResult.error ?? "Teaching ID is invalid." };
  }

  const { supabase } = await requireAdmin();
  const { error } = await supabase
    .from("teaching_printable_pdf_links")
    .delete()
    .eq("teaching_id", teachingIdResult.value);

  if (error) {
    return { error: "Printable PDF link could not be removed." };
  }

  revalidatePrintablePdfPaths();
  return { removed: true };
}
