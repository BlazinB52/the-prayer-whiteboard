/* eslint-disable @next/next/no-img-element */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCalloutLabel, getCalloutStyles, normalizeCallout } from "../../admin/teachings/callout-utils";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { createClient } from "@/lib/supabase/server";

type Content = Record<string, unknown>;
type Asset = { id: string; teaching_id: string; category_id: string | null; section_id: string | null; alt_text: string; caption: string | null; website_storage_path: string | null; storage_path: string; download_storage_path: string | null; allow_download: boolean };

const TEACHING_RESOURCES = [
  {
    title: "Printable Teaching PDF",
    description: "The complete teaching formatted for printing.",
  },
  {
    title: "Foldable Teaching Guide",
    description: "A condensed teaching guide designed for printing and folding.",
  },
  {
    title: "Presentation Slides",
    description: "Slides for teaching groups or displaying on a screen.",
  },
  {
    title: "TV/Roku Backdrop",
    description: "A landscape chalkboard image for televisions and digital displays.",
  },
];

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("teachings").select("title, summary").eq("slug", slug).eq("status", "published").maybeSingle();
  if (!data) return { title: "Teaching | The Whiteboard", robots: { index: false, follow: false } };
  return { title: `${data.title} | The Whiteboard`, description: data.summary ?? undefined };
}

export default async function StructuredTeachingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: teaching, error: teachingError } = await supabase.from("teachings").select("id, title, gathering_date, central_theme, introduction, summary, status, slug").eq("slug", slug).eq("status", "published").maybeSingle();
  if (teachingError || !teaching || teaching.slug !== slug) notFound();

  const [{ data: categories, error: categoriesError }, { data: sections, error: sectionsError }, { data: assets, error: assetsError }] = await Promise.all([
    supabase.from("teaching_categories").select("id, teaching_id, title, sort_order, status").eq("teaching_id", teaching.id).eq("status", "published").order("sort_order"),
    supabase.from("teaching_sections").select("id, teaching_id, category_id, title, content, sort_order, status").eq("teaching_id", teaching.id).eq("status", "published").order("sort_order"),
    supabase.from("chalkboard_assets").select("id, teaching_id, category_id, section_id, alt_text, caption, website_storage_path, storage_path, download_storage_path, allow_download, display_order, is_current_version, status").eq("teaching_id", teaching.id).eq("is_current_version", true).eq("status", "active").order("display_order"),
  ]);
  if (categoriesError || sectionsError || assetsError) notFound();
  const validCategories = (categories ?? []).filter((category) => category.teaching_id === teaching.id);
  const validSections = (sections ?? []).filter((section) => section.teaching_id === teaching.id && validCategories.some((category) => category.id === section.category_id));
  const validAssets = (assets ?? []).filter((asset) => asset.teaching_id === teaching.id && (!asset.category_id || validCategories.some((category) => category.id === asset.category_id)) && (!asset.section_id || validSections.some((section) => section.id === asset.section_id && section.category_id === asset.category_id))) as Asset[];
  const signer = createServiceRoleClient();
  const assetsWithUrls = await Promise.all(validAssets.map(async (asset) => ({ asset, url: await getWebsiteUrl(signer, asset) })));
  const byTeaching = assetsWithUrls.filter(({ asset }) => !asset.category_id && !asset.section_id);
  const byCategory = (categoryId: string) => assetsWithUrls.filter(({ asset }) => asset.category_id === categoryId && !asset.section_id);
  const bySection = (sectionId: string) => assetsWithUrls.filter(({ asset }) => asset.section_id === sectionId);

  return (
    <main className="min-h-screen bg-[#f7f2e8] text-[#243126]">
      <header className="border-b border-[#284a3b]/10 bg-[#fffdf8]"><div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-5 py-4 sm:px-8"><Link href="/" className="font-extrabold text-[#21382e]">The Whiteboard</Link><Link href="/" className="text-sm font-extrabold text-[#244a3a]">Back to home</Link></div></header>
      <article className="mx-auto max-w-4xl px-5 py-10 sm:px-8 sm:py-16">
        <header className="border-b border-[#284a3b]/15 pb-8"><p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#946332]">The Prayer Whiteboard</p><h1 className="mt-3 text-4xl font-extrabold leading-tight tracking-tight text-[#243d31] sm:text-6xl">{teaching.title}</h1>{teaching.gathering_date ? <p className="mt-4 text-sm font-bold text-[#607066]">{formatDate(teaching.gathering_date)}</p> : null}{teaching.central_theme ? <p className="mt-5 text-lg font-bold text-[#385245]">{teaching.central_theme}</p> : null}{teaching.introduction ? <TextParagraphs text={teaching.introduction} className="mt-5 text-[#52645a]" /> : null}{teaching.summary ? <TextParagraphs text={teaching.summary} className="mt-5 text-[#52645a]" /> : null}</header>
        <div className="mt-8 space-y-8">{byTeaching.map(({ asset, url }) => <PublicChalkboard key={asset.id} asset={asset} url={url} slug={slug} />)}</div>
        <div className="mt-10 space-y-10">{validCategories.map((category) => <section key={category.id} className="space-y-6"><h2 className="border-b border-[#284a3b]/15 pb-2 text-2xl font-extrabold text-[#243d31]">{category.title}</h2>{byCategory(category.id).map(({ asset, url }) => <PublicChalkboard key={asset.id} asset={asset} url={url} slug={slug} />)}<div className="space-y-7">{validSections.filter((section) => section.category_id === category.id).map((section) => <div key={section.id}>{bySection(section.id).map(({ asset, url }) => <PublicChalkboard key={asset.id} asset={asset} url={url} slug={slug} />)}<PublicSection sectionId={section.id} title={section.title} content={section.content} /></div>)}</div></section>)}</div>
        <TeachingResources />
      </article>
    </main>
  );
}

async function getWebsiteUrl(signer: ReturnType<typeof createServiceRoleClient>, asset: Asset) {
  if (!signer) return null;
  const paths = [asset.website_storage_path, asset.storage_path].filter((path, index, values): path is string => Boolean(path) && values.indexOf(path) === index);
  for (const path of paths) {
    const { data } = await signer.storage.from("chalkboards").createSignedUrl(path, 300);
    if (data?.signedUrl) return data.signedUrl;
  }
  return null;
}

function PublicChalkboard({ asset, url, slug }: { asset: Asset; url: string | null; slug: string }) {
  if (!url) return null;
  return <figure className="my-8"><a href={url} target="_blank" rel="noreferrer" aria-label="View chalkboard larger"><img src={url} alt={asset.alt_text} className="mx-auto block h-auto w-full max-w-[680px] object-contain" /></a>{asset.caption?.trim() ? <figcaption className="mt-3 text-center text-sm text-[#607066]">{asset.caption.trim()}</figcaption> : null}{asset.allow_download && asset.download_storage_path ? <a href={`/api/teachings/${encodeURIComponent(slug)}/chalkboards/${asset.id}/download`} className="mt-3 inline-flex min-h-10 items-center justify-center rounded-xl bg-[#244a3a] px-4 text-sm font-extrabold text-white">Download chalkboard</a> : null}</figure>;
}

function TeachingResources() {
  return (
    <section className="mt-14 border-t border-[#284a3b]/15 pt-9">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#946332]">Resources</p>
          <h2 className="mt-2 text-2xl font-extrabold text-[#243d31]">Teaching Resources</h2>
        </div>
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {TEACHING_RESOURCES.map((resource) => (
          <div key={resource.title} className="rounded-xl border border-[#284a3b]/12 bg-[#fffdf8] p-5 shadow-sm shadow-[#4d5f52]/5" aria-disabled="true">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-base font-extrabold text-[#385245]">{resource.title}</h3>
              <span className="shrink-0 rounded-full bg-[#f1c66f]/35 px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-[#946332]">Coming Soon</span>
            </div>
            <p className="mt-3 text-sm leading-6 text-[#607066]">{resource.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function PublicSection({ sectionId, title, content }: { sectionId: string; title: string; content: unknown }) {
  const value = content && typeof content === "object" ? content as Content : {};
  const callout = normalizeCallout(value.callout);
  const body = <SectionContent value={value} />;
  if (!callout) return <section id={`section-${sectionId}`} className="public-section">{value.showTitle !== false ? <h3 className="text-lg font-extrabold text-[#385245]">{title}</h3> : null}<div className="mt-3 text-[#52645a]">{body}</div></section>;
  const label = getCalloutLabel(callout);
  return <section id={`section-${sectionId}`} className="public-section"><div className="rounded-xl px-4 py-3 text-sm" style={getCalloutStyles(callout.color, callout.style)}>{label ? <div className="text-xs font-extrabold uppercase tracking-[0.14em]">{label}</div> : null}{value.showTitle !== false ? <h3 className="mt-2 text-lg font-extrabold text-[#385245]">{title}</h3> : null}<div className="mt-3 text-[#52645a]">{body}</div></div></section>;
}

function SectionContent({ value }: { value: Content }) {
  if (value.format === "bullets" && Array.isArray(value.bullets)) return <><TextParagraphs text={value.introduction} /><ul className="mt-3 list-disc space-y-2 pl-6">{value.bullets.map((bullet) => <li key={String(bullet)}>{String(bullet)}</li>)}</ul><TextParagraphs text={value.conclusion} className="mt-3" /></>;
  if (value.format === "scripture") return <div><TextParagraphs text={value.introduction} /><p className="mt-3 font-bold text-[#385245]">{String(value.reference ?? "")}{value.translation ? <span className="ml-2 font-normal text-[#607066]">({String(value.translation)})</span> : null}</p><div className="mt-2 italic"><TextParagraphs text={value.quotation} /></div></div>;
  return <TextParagraphs text={value.text} className={value.format === "takeaway" ? "font-bold text-[#385245]" : undefined} />;
}

function TextParagraphs({ text, className }: { text: unknown; className?: string }) { const paragraphs = String(text ?? "").replace(/\r\n?/g, "\n").split("\n").map((paragraph) => paragraph.trim()).filter(Boolean); return <div className={`space-y-3 ${className ?? ""}`}>{paragraphs.map((paragraph, index) => <p key={`${index}-${paragraph.slice(0, 20)}`} className="whitespace-pre-wrap">{paragraph}</p>)}</div>; }
function formatDate(value: string) { return new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`)); }
