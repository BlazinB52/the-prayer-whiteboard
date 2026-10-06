import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OutlineContent } from "@/app/teaching-outlines/outline-content";
import { requireAdmin } from "@/lib/supabase/admin";
import { OUTLINE_BUCKET, validateOutlineId, type OutlineBlock } from "@/lib/teaching-outlines";

export const metadata: Metadata = {
  title: "Outline Preview",
  robots: { index: false, follow: false },
};

export default async function AdminOutlinePreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const idResult = validateOutlineId(id);
  if (!idResult.value) notFound();

  const { supabase } = await requireAdmin();
  const { data: outline } = await supabase
    .from("teaching_outlines")
    .select("title, subtitle, status, content, source_path, source_file_name, outline_categories(name)")
    .eq("id", idResult.value)
    .maybeSingle();
  if (!outline) notFound();

  const category = Array.isArray(outline.outline_categories) ? outline.outline_categories[0] : outline.outline_categories;
  const downloadHref = supabase.storage
    .from(OUTLINE_BUCKET)
    .getPublicUrl(outline.source_path, { download: outline.source_file_name ?? "outline.docx" }).data.publicUrl;

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
          <a href={downloadHref} className="mt-4 inline-block text-sm font-extrabold text-[#946332] hover:text-[#a85e32]">Download original .docx</a>
        </header>
        <div className="py-6">
          <OutlineContent blocks={outline.content as OutlineBlock[]} />
        </div>
      </div>
    </main>
  );
}
