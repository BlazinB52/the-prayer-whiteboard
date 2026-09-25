"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/supabase/admin";
import { validatePrintablePdfUrl } from "@/lib/printable-pdf-links";

type PrintablePdfState = { error?: string; saved?: boolean; removed?: boolean };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;

function revalidatePrintablePdfPaths() {
  revalidatePath("/admin");
  revalidatePath("/admin/printable-pdfs");
}

export async function savePrintablePdfLink(_: PrintablePdfState, formData: FormData): Promise<PrintablePdfState> {
  const teachingId = String(formData.get("teachingId") ?? "").trim();

  if (!UUID_PATTERN.test(teachingId)) {
    return { error: "Teaching could not be found." };
  }

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

  if (teachingError || !teaching) {
    return { error: "Teaching could not be found." };
  }

  const { error } = await supabase
    .from("teaching_printable_pdf_links")
    .upsert({ teaching_id: teachingId, printable_pdf_url: url.value }, { onConflict: "teaching_id" });

  if (error) {
    return { error: "Printable PDF link could not be saved." };
  }

  revalidatePrintablePdfPaths();
  return { saved: true };
}

export async function removePrintablePdfLink(teachingId: string, previousState: PrintablePdfState): Promise<PrintablePdfState> {
  void previousState;
  if (!UUID_PATTERN.test(teachingId)) {
    return { error: "Teaching could not be found." };
  }

  const { supabase } = await requireAdmin();
  const { error } = await supabase
    .from("teaching_printable_pdf_links")
    .delete()
    .eq("teaching_id", teachingId);

  if (error) {
    return { error: "Printable PDF link could not be removed." };
  }

  revalidatePrintablePdfPaths();
  return { removed: true };
}
