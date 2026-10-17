import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OutlineContent } from "@/app/teaching-outlines/outline-content";
import { requireContentManager } from "@/lib/supabase/admin";
import type { OutlineBlock } from "@/lib/teaching-outlines";
import { PrintPreviewButton } from "../../../print-preview-button";

export const metadata: Metadata = {
  title: "Print Preview - Teaching Outline",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// What the outline looks like on paper: the approved text, without the review tools. Nothing here can change the outline.
export default async function OutlineReviewPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) notFound();

  const { supabase } = await requireContentManager();
  // The database only returns a draft outline that the Administrator sent to this person, so anything else is "not found".
  const { data: outline } = await supabase.from("teaching_outlines").select("title, subtitle, content").eq("id", id).eq("status", "draft").maybeSingle();
  if (!outline) notFound();

  return (
    <main className="min-h-screen bg-[#eee7da] px-4 py-6 text-[#243126] sm:px-8 sm:py-10">
      <div className="print-controls mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 pb-5">
        <Link href={`/admin/cm/outline-review/${id}`} className="admin-secondary-button inline-flex items-center justify-center"><span>Back to Review</span></Link>
        <PrintPreviewButton label="Print Outline" />
      </div>
      <p className="print-controls mx-auto mb-4 max-w-3xl text-sm text-[#607066]">This is the approved text. Changes you have proposed are not shown until the Administrator accepts them.</p>
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
