/* eslint-disable @next/next/no-img-element */
import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/supabase/admin";
import { ChalkboardForm } from "./chalkboard-form";
import { getChalkboardPreviewUrl } from "./actions";

export const metadata: Metadata = { title: "Chalkboards", robots: { index: false, follow: false } };

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(value));
}

export default async function ChalkboardsPage() {
  const { supabase } = await requireAdmin();
  const [{ data: teachings }, { data: assets, error }] = await Promise.all([
    supabase.from("teachings").select("id, title").eq("status", "draft").order("title"),
    supabase.from("chalkboard_assets").select("id, teaching_id, category_id, section_id, title, alt_text, caption, website_storage_path, width, height, display_order, include_in_print, allow_download, uploaded_at").order("uploaded_at", { ascending: false }),
  ]);
  const { data: categories } = await supabase.from("teaching_categories").select("id, teaching_id, title").order("sort_order");
  const { data: sections } = await supabase.from("teaching_sections").select("id, teaching_id, category_id, title").order("sort_order");
  const teachingMap = new Map((teachings ?? []).map((teaching) => [teaching.id, teaching.title]));
  const categoryMap = new Map((categories ?? []).map((category) => [category.id, category.title]));
  const sectionMap = new Map((sections ?? []).map((section) => [section.id, section.title]));
  const formTeachings = (teachings ?? []).map((teaching) => ({ ...teaching, categories: (categories ?? []).filter((category) => category.teaching_id === teaching.id).map((category) => ({ ...category, sections: (sections ?? []).filter((section) => section.category_id === category.id && section.teaching_id === teaching.id) })) }));
  const previews = await Promise.all((assets ?? []).map(async (asset) => ({ asset, url: await getChalkboardPreviewUrl(asset.website_storage_path) })));

  return (
    <main className="admin-shell">
      <div className="mx-auto max-w-6xl">
        <Link href="/admin" className="text-sm font-extrabold text-[#946332] hover:text-[#a85e32]">Back to dashboard</Link>
        <div className="mt-4 border-b border-[#284a3b]/10 pb-8"><h1 className="text-4xl font-extrabold tracking-tight text-[#243d31]">Chalkboards</h1><p className="mt-3 text-sm text-[#607066]">Private visual assets for draft teachings. Public delivery is unavailable until a teaching is published.</p></div>
        <section className="py-8"><ChalkboardForm teachings={formTeachings} /></section>
        <section className="border-t border-[#284a3b]/10 py-8"><h2 className="text-2xl font-extrabold text-[#243d31]">Existing chalkboards</h2>{error ? <p className="mt-4 text-sm font-bold text-[#a2472c]">Chalkboards could not be loaded.</p> : null}{previews.length ? <div className="mt-5 grid gap-5 lg:grid-cols-2">{previews.map(({ asset, url }) => <article key={asset.id} className="rounded-2xl border border-[#284a3b]/10 bg-[#fffdf8] p-4 shadow-lg shadow-[#4d5f52]/8"><div className="grid gap-4 sm:grid-cols-[160px_1fr]"><div className="flex min-h-52 items-center justify-center overflow-hidden rounded-xl bg-[#eee7da]">{url ? <img src={url} alt={asset.alt_text} className="h-full max-h-72 w-full object-contain" /> : <p className="px-3 text-center text-xs text-[#607066]">Preview unavailable</p>}</div><div><p className="text-xs font-black uppercase tracking-[0.14em] text-[#946332]">{teachingMap.get(asset.teaching_id) ?? "Unknown teaching"}</p><h3 className="mt-2 text-xl font-extrabold text-[#243d31]">{asset.title}</h3><p className="mt-2 text-sm text-[#607066]">{asset.section_id ? `Section: ${sectionMap.get(asset.section_id) ?? "Unknown"}` : asset.category_id ? `Category: ${categoryMap.get(asset.category_id) ?? "Unknown"}` : "Entire teaching"}</p><dl className="mt-4 grid gap-2 text-sm text-[#607066]"><div className="flex justify-between gap-3"><dt>Dimensions</dt><dd className="font-bold text-[#385245]">{asset.width} × {asset.height}</dd></div><div className="flex justify-between gap-3"><dt>Print</dt><dd className="font-bold text-[#385245]">{asset.include_in_print ? "Included" : "Excluded"}</dd></div><div className="flex justify-between gap-3"><dt>Download</dt><dd className="font-bold text-[#385245]">{asset.allow_download ? "Allowed" : "Disabled"}</dd></div><div className="flex justify-between gap-3"><dt>Uploaded</dt><dd className="font-bold text-[#385245]">{formatDate(asset.uploaded_at)}</dd></div></dl>{asset.caption ? <p className="mt-4 text-sm italic text-[#607066]">{asset.caption}</p> : null}</div></div></article>)}</div> : <p className="mt-4 text-sm text-[#607066]">No chalkboards have been uploaded yet.</p>}</section>
      </div>
    </main>
  );
}
