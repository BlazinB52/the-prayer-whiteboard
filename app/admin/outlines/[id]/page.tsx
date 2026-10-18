import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OutlineContent } from "@/app/teaching-outlines/outline-content";
import { sendForReview, takeBackFromReview } from "@/app/admin/review-gate-actions";
import { ReviewGateMessage, ReviewGateSection } from "@/app/admin/review-gate-section";
import { requireAdmin } from "@/lib/supabase/admin";
import { OUTLINE_BUCKET, validateOutlineId, type OutlineBlock } from "@/lib/teaching-outlines";

export const metadata: Metadata = {
  title: "Outline Preview",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminOutlinePreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ review?: string; mailed?: string; of?: string }>;
}) {
  const [{ id }, flags] = await Promise.all([params, searchParams]);
  const idResult = validateOutlineId(id);
  if (!idResult.value) notFound();

  const { supabase } = await requireAdmin();
  const { data: outline } = await supabase
    .from("teaching_outlines")
    .select("title, subtitle, status, sent_for_review_at, content, source_path, source_file_name, outline_categories(name)")
    .eq("id", idResult.value)
    .maybeSingle();
  if (!outline) notFound();

  // Proposals Content Managers have submitted and the Administrator has not finished with.
  const { count: awaiting } = await supabase
    .from("content_revisions")
    .select("id", { count: "exact", head: true })
    .eq("subject_type", "outline")
    .eq("outline_id", idResult.value)
    .eq("status", "submitted");

  const category = Array.isArray(outline.outline_categories) ? outline.outline_categories[0] : outline.outline_categories;
  const downloadHref = supabase.storage
    .from(OUTLINE_BUCKET)
    .getPublicUrl(outline.source_path, { download: outline.source_file_name ?? "outline.docx" }).data.publicUrl;
  const isDraft = outline.status === "draft";

  return (
    <main className="admin-shell">
      <div className="mx-auto max-w-4xl">
        <Link href="/admin/outlines" className="text-sm font-extrabold text-[#946332] hover:text-[#a85e32]">Back to outlines</Link>
        <header className="mt-4 border-b border-[#284a3b]/10 pb-6">
          <p className="text-xs font-black uppercase tracking-wider text-[#946332]">
            {category?.name ?? "Uncategorized"} · {outline.status === "published" ? "Published" : "Draft"}
          </p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-[#243d31]">{outline.title}</h1>
          {outline.subtitle ? <p className="mt-1 text-sm font-bold uppercase tracking-wider text-[#607066]">{outline.subtitle}</p> : null}
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm font-extrabold">
            {isDraft ? <Link href={`/admin/outlines/${idResult.value}/edit-text`} className="text-[#946332] hover:text-[#a85e32]">Edit text</Link> : null}
            <Link href="/admin/teaching-revisions" className="text-[#946332] hover:text-[#a85e32]">Revisions{awaiting ? ` (${awaiting} awaiting review)` : ""}</Link>
            <a href={downloadHref} className="text-[#946332] hover:text-[#a85e32]">Download original .docx</a>
          </div>
          <p className="mt-2 text-xs text-[#607066]">The download is the Word file as it was uploaded, before any edits made here or accepted from a Content Manager.</p>
          {!isDraft ? <p className="mt-2 text-xs text-[#607066]">To edit the text or send it for review again, unpublish it first on the outlines page. Publishing closes any review that was still open.</p> : null}
        </header>

        <ReviewGateMessage review={flags.review} mailed={flags.mailed} of={flags.of} />
        {isDraft ? (
          <ReviewGateSection
            noun="teaching outline"
            kind="outline"
            subjectId={idResult.value}
            sentAt={outline.sent_for_review_at ?? null}
            sendAction={sendForReview.bind(null, "outline", idResult.value)}
            takeBackAction={takeBackFromReview.bind(null, "outline", idResult.value)}
          />
        ) : null}

        <div className="py-6">
          <OutlineContent blocks={outline.content as OutlineBlock[]} />
        </div>
      </div>
    </main>
  );
}
