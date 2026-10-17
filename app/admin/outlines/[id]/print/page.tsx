import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PrintPreviewButton } from "@/app/admin/cm/print-preview-button";
import { OutlineContent } from "@/app/teaching-outlines/outline-content";
import { requireAdmin } from "@/lib/supabase/admin";
import { validateOutlineId, type OutlineBlock } from "@/lib/teaching-outlines";

export const metadata: Metadata = {
  title: "Print Preview - Teaching Outline",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

// What the outline looks like on paper: the saved text, without the editing tools. Nothing here can change the outline.
export default async function AdminOutlinePrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const idResult = validateOutlineId(id);
  if (!idResult.value) notFound();

  const { supabase } = await requireAdmin();
  const { data: outline } = await supabase.from("teaching_outlines").select("title, subtitle, status, content").eq("id", idResult.value).maybeSingle();
  if (!outline) notFound();

  const back = outline.status === "draft" ? `/admin/outlines/${idResult.value}/edit-text` : `/admin/outlines/${idResult.value}`;

  return (
    <main className="min-h-screen bg-[#eee7da] px-4 py-6 text-[#243126] sm:px-8 sm:py-10">
      <div className="print-controls mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 pb-5">
        <Link href={back} className="admin-secondary-button inline-flex items-center justify-center"><span>{outline.status === "draft" ? "Back to Edit Text" : "Back to the Outline"}</span></Link>
        <PrintPreviewButton label="Print Outline" />
      </div>
      <p className="print-controls mx-auto mb-4 max-w-3xl text-sm text-[#607066]">This is the saved text. Save any edits first, or they will not appear here.</p>
      <article className="print-paper mx-auto max-w-3xl rounded-2xl bg-white p-7 shadow-xl shadow-[#4d5f52]/10 sm:p-12">
        <header className="border-b border-[#284a3b]/15 pb-6">
          <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#946332]">The Prayer Whiteboard</p>
          <h1 className="mt-3 text-3xl font-extrabold leading-tight tracking-tight text-[#243d31]">{outline.title}</h1>
          {outline.subtitle ? <p className="mt-2 text-sm font-bold uppercase tracking-wider text-[#607066]">{outline.subtitle}</p> : null}
        </header>
        <div className="py-6">
          <OutlineContent blocks={outline.content as OutlineBlock[]} />
        </div>
      </article>
    </main>
  );
}
