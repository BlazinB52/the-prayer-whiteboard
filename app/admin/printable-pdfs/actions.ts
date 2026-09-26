"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/supabase/admin";
import { validatePrintablePdfId, validatePrintablePdfTitle, validatePrintablePdfUrl } from "@/lib/printable-pdf-links";

type PrintablePdfState = { error?: string; saved?: boolean; removed?: boolean };

function revalidatePrintablePdfPaths() {
  revalidatePath("/admin");
  revalidatePath("/admin/printable-pdfs");
  revalidatePath("/pdf");
}

export async function savePrintablePdfLink(_: PrintablePdfState, formData: FormData): Promise<PrintablePdfState> {
  const title = validatePrintablePdfTitle(formData.get("title"));
  if (title.error || !title.value) {
    return { error: title.error ?? "Title is invalid." };
  }

  const url = validatePrintablePdfUrl(String(formData.get("printablePdfUrl") ?? ""));
  if (url.error || !url.value) {
    return { error: url.error ?? "Printable PDF URL is invalid." };
  }

  const { supabase } = await requireAdmin();
  const rawId = formData.get("id");

  if (rawId) {
    const id = validatePrintablePdfId(rawId);
    if (id.error || !id.value) {
      return { error: id.error ?? "Printable PDF record ID is invalid." };
    }

    const { data, error } = await supabase
      .from("printable_pdf_links")
      .update({ title: title.value, printable_pdf_url: url.value })
      .eq("id", id.value)
      .select("id")
      .maybeSingle();

    if (error) {
      return { error: "Printable PDF link could not be saved." };
    }

    if (!data) {
      return { error: "Printable PDF link could not be found." };
    }
  } else {
    const { error } = await supabase
      .from("printable_pdf_links")
      .insert({ title: title.value, printable_pdf_url: url.value });
    if (error) {
      return { error: "Printable PDF link could not be saved." };
    }
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
  const { error } = await supabase
    .from("printable_pdf_links")
    .delete()
    .eq("id", idResult.value);

  if (error) {
    return { error: "Printable PDF link could not be removed." };
  }

  revalidatePrintablePdfPaths();
  return { removed: true };
}
