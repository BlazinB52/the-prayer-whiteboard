import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteChalkboard, getChalkboardPreviewUrl, updateChalkboardDetails } from "../actions";
import { loadChalkboardAssignments } from "../assignments";
import { ChalkboardCard } from "../chalkboard-card";
import { requireAdmin } from "@/lib/supabase/admin";

export const metadata: Metadata = {
  title: "Edit Chalkboard",
  robots: { index: false, follow: false },
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function AdminChalkboardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) notFound();

  const { supabase } = await requireAdmin();
  const { data: asset } = await supabase
    .from("chalkboard_assets")
    .select("id, title, canonical_name, language, chalkboard_date, alt_text, caption, website_storage_path, width, height, include_in_print, allow_download, download_storage_path, uploaded_at")
    .eq("id", id)
    .eq("is_current_version", true)
    .eq("status", "active")
    .maybeSingle();
  if (!asset) notFound();

  const [assignmentsByAsset, url] = await Promise.all([
    loadChalkboardAssignments(supabase),
    asset.website_storage_path ? getChalkboardPreviewUrl(asset.website_storage_path) : Promise.resolve(null),
  ]);

  return (
    <main className="admin-shell">
      <div className="mx-auto max-w-3xl">
        <Link href="/admin/chalkboards" className="text-sm font-extrabold text-[#946332] hover:text-[#a85e32]">Back to Chalkboard Library</Link>
        <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-[#243d31]">Edit Chalkboard</h1>
        <div className="mt-8">
          <ChalkboardCard
            asset={{
              id: asset.id,
              canonicalName: asset.canonical_name ?? asset.title,
              language: asset.language === "es" ? "es" : "en",
              chalkboardDate: asset.chalkboard_date ? asset.chalkboard_date.slice(0, 10) : "",
              assignments: assignmentsByAsset.get(asset.id) ?? [],
              title: asset.title,
              alt_text: asset.alt_text,
              caption: asset.caption,
              include_in_print: asset.include_in_print,
              allow_download: asset.allow_download,
              hasDownloadPath: Boolean(asset.download_storage_path),
              width: asset.width,
              height: asset.height,
              uploaded_at: asset.uploaded_at,
              previewUrl: url,
            }}
            updateAction={updateChalkboardDetails}
            deleteAction={deleteChalkboard.bind(null, asset.id)}
          />
        </div>
      </div>
    </main>
  );
}
