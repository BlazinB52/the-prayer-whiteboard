import type { Metadata } from "next";
import Link from "next/link";
import { ChalkboardForm } from "./chalkboard-form";
import { deleteChalkboard, getChalkboardPreviewUrl, updateChalkboardDetails } from "./actions";
import { ChalkboardCard } from "./chalkboard-card";
import { requireAdmin } from "@/lib/supabase/admin";

export const metadata: Metadata = {
  title: "Chalkboard Library",
  robots: { index: false, follow: false },
};

function dateForInput(value: string | null) {
  return value ? value.slice(0, 10) : "";
}

export default async function AdminChalkboardsPage() {
  const { supabase } = await requireAdmin();
  const [{ data: teachings }, { data: assets, error }] = await Promise.all([
    supabase.from("teachings").select("id, title, chalkboard_asset_id").in("status", ["draft", "published"]).order("gathering_date", { ascending: false }),
    supabase
      .from("chalkboard_assets")
      .select("id, title, canonical_name, chalkboard_date, alt_text, caption, website_storage_path, width, height, include_in_print, allow_download, download_storage_path, uploaded_at")
      .eq("is_current_version", true)
      .eq("status", "active")
      .order("chalkboard_date", { ascending: false })
      .order("canonical_name", { ascending: true }),
  ]);

  const teachingByAsset = new Map((teachings ?? []).filter((teaching) => teaching.chalkboard_asset_id).map((teaching) => [teaching.chalkboard_asset_id as string, teaching.title]));
  const previews = await Promise.all((assets ?? []).map(async (asset) => ({ asset, url: asset.website_storage_path ? await getChalkboardPreviewUrl(asset.website_storage_path) : null })));

  return (
    <main className="admin-shell">
      <div className="mx-auto max-w-6xl">
        <Link href="/admin" className="text-sm font-extrabold text-[#946332] hover:text-[#a85e32]">Back to Dashboard</Link>
        <div className="mt-4 max-w-3xl">
          <h1 className="text-4xl font-extrabold tracking-tight text-[#243d31]">Chalkboard Library</h1>
          <p className="mt-3 text-sm text-[#607066]">Upload reusable chalkboards independently, then attach one optional chalkboard to each teaching.</p>
        </div>
        <section className="py-8"><ChalkboardForm /></section>
        <section className="border-t border-[#284a3b]/10 py-8">
          <h2 className="text-2xl font-extrabold text-[#243d31]">Existing chalkboards</h2>
          {error ? <p className="mt-4 text-sm font-bold text-[#a2472c]">Chalkboards could not be loaded.</p> : null}
          {previews.length ? (
            <div className="mt-5 grid items-start gap-5 lg:grid-cols-2">
              {previews.map(({ asset, url }) => (
                <ChalkboardCard
                  key={asset.id}
                  asset={{
                    id: asset.id,
                    canonicalName: asset.canonical_name ?? asset.title,
                    chalkboardDate: dateForInput(asset.chalkboard_date),
                    teachingTitle: teachingByAsset.get(asset.id) ?? null,
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
              ))}
            </div>
          ) : <p className="mt-4 text-sm text-[#607066]">No chalkboards have been uploaded yet.</p>}
        </section>
      </div>
    </main>
  );
}
