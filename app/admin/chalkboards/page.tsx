import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/supabase/admin";
import { ChalkboardForm } from "./chalkboard-form";
import { getChalkboardPreviewUrl, updateChalkboardDetails } from "./actions";
import { ChalkboardCard } from "./chalkboard-card";

export const metadata: Metadata = { title: "Chalkboards", robots: { index: false, follow: false } };

export default async function ChalkboardsPage() {
  const { supabase } = await requireAdmin();
  const [{ data: draftTeachings }, { data: allTeachings }, { data: assets, error }] = await Promise.all([
    supabase.from("teachings").select("id, title").eq("status", "draft").order("title"),
    supabase.from("teachings").select("id, title").order("title"),
    supabase.from("chalkboard_assets").select("id, teaching_id, category_id, section_id, title, alt_text, caption, website_storage_path, width, height, display_order, include_in_print, allow_download, download_storage_path, uploaded_at").order("uploaded_at", { ascending: false }),
  ]);
  const { data: categories } = await supabase.from("teaching_categories").select("id, teaching_id, title").order("sort_order");
  const { data: sections } = await supabase.from("teaching_sections").select("id, teaching_id, category_id, title").order("sort_order");
  const teachingMap = new Map((allTeachings ?? []).map((teaching) => [teaching.id, teaching.title]));
  const categoryMap = new Map((categories ?? []).map((category) => [`${category.teaching_id}:${category.id}`, category.title]));
  const sectionMap = new Map((sections ?? []).map((section) => [`${section.teaching_id}:${section.id}`, section.title]));
  const formTeachings = (draftTeachings ?? []).map((teaching) => ({ ...teaching, categories: (categories ?? []).filter((category) => category.teaching_id === teaching.id).map((category) => ({ ...category, sections: (sections ?? []).filter((section) => section.category_id === category.id && section.teaching_id === teaching.id) })) }));
  const previews = await Promise.all((assets ?? []).map(async (asset) => ({ asset, url: await getChalkboardPreviewUrl(asset.website_storage_path) })));

  return (
    <main className="admin-shell">
      <div className="mx-auto max-w-6xl">
        <Link href="/admin" className="text-sm font-extrabold text-[#946332] hover:text-[#a85e32]">Back to dashboard</Link>
        <div className="mt-4 border-b border-[#284a3b]/10 pb-8"><h1 className="text-4xl font-extrabold tracking-tight text-[#243d31]">Chalkboards</h1><p className="mt-3 text-sm text-[#607066]">Private visual assets for draft teachings. Public delivery is unavailable until a teaching is published.</p></div>
        <section className="py-8"><ChalkboardForm teachings={formTeachings} /></section>
        <section className="border-t border-[#284a3b]/10 py-8"><h2 className="text-2xl font-extrabold text-[#243d31]">Existing chalkboards</h2>{error ? <p className="mt-4 text-sm font-bold text-[#a2472c]">Chalkboards could not be loaded.</p> : null}{previews.length ? <div className="mt-5 grid items-start gap-5 lg:grid-cols-2">{previews.map(({ asset, url }) => <ChalkboardCard key={asset.id} asset={{ id: asset.id, teachingId: asset.teaching_id, teachingTitle: teachingMap.get(asset.teaching_id) ?? "Unknown teaching", title: asset.title, alt_text: asset.alt_text, caption: asset.caption, include_in_print: asset.include_in_print, allow_download: asset.allow_download, hasDownloadPath: Boolean(asset.download_storage_path), width: asset.width, height: asset.height, location: asset.section_id ? `Section: ${sectionMap.get(`${asset.teaching_id}:${asset.section_id}`) ?? "Unknown"}` : asset.category_id ? `Category: ${categoryMap.get(`${asset.teaching_id}:${asset.category_id}`) ?? "Unknown"}` : "Entire teaching", uploaded_at: asset.uploaded_at, previewUrl: url }} action={updateChalkboardDetails.bind(null, asset.id)} />)}</div> : <p className="mt-4 text-sm text-[#607066]">No chalkboards have been uploaded yet.</p>}</section>
      </div>
    </main>
  );
}
