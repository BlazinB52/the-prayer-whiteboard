/* eslint-disable @next/next/no-img-element */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/supabase/admin";
import { getChalkboardPreviewUrl } from "../../../chalkboards/actions";
import { getCalloutLabel, getCalloutStyles, normalizeCallout } from "../../callout-utils";
import { PrintButton } from "./print-button";

export const metadata: Metadata = {
  title: "Printable Teaching Preview",
  robots: { index: false, follow: false },
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Content = Record<string, unknown>;
type ChalkboardAsset = {
  id: string;
  teaching_id: string;
  category_id: string | null;
  section_id: string | null;
  title: string;
  alt_text: string;
  caption: string | null;
  website_storage_path: string | null;
  storage_path: string;
  display_order: number;
};

export default async function PrintableTeachingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) notFound();

  const { supabase } = await requireAdmin();
  const { data: teaching, error: teachingError } = await supabase
    .from("teachings")
    .select("id, title, gathering_date, central_theme, introduction, summary, status")
    .eq("id", id)
    .eq("status", "draft")
    .maybeSingle();

  if (teachingError || !teaching) notFound();

  const { data: categories, error: categoriesError } = await supabase
    .from("teaching_categories")
    .select("id, teaching_id, title, sort_order, status")
    .eq("teaching_id", id)
    .eq("status", "draft")
    .order("sort_order", { ascending: true });
  const { data: sections, error: sectionsError } = await supabase
    .from("teaching_sections")
    .select("id, teaching_id, category_id, title, content, sort_order, status")
    .eq("teaching_id", id)
    .eq("status", "draft")
    .order("sort_order", { ascending: true });
  const { data: chalkboardAssets, error: chalkboardError } = await supabase
    .from("chalkboard_assets")
    .select("id, teaching_id, category_id, section_id, title, alt_text, caption, website_storage_path, storage_path, display_order")
    .eq("teaching_id", id)
    .eq("is_current_version", true)
    .eq("status", "active")
    .eq("include_in_print", true)
    .order("display_order", { ascending: true });

  if (categoriesError || sectionsError || chalkboardError) notFound();
  if ((categories ?? []).some((category) => category.teaching_id !== teaching.id) || (sections ?? []).some((section) => section.teaching_id !== teaching.id)) notFound();

  const orderedCategories = (categories ?? []).map((category) => ({
    ...category,
    sections: (sections ?? []).filter((section) => section.category_id === category.id),
  }));
  const printableAssets = (chalkboardAssets ?? []).filter((asset) => asset.teaching_id === teaching.id) as ChalkboardAsset[];
  const assetsWithUrls = await Promise.all(printableAssets.map(async (asset) => ({ asset, url: await getChalkboardPreviewUrl(asset.website_storage_path || asset.storage_path) })));
  const assetsForTeaching = assetsWithUrls.filter(({ asset }) => !asset.category_id && !asset.section_id);
  const assetsForCategory = (categoryId: string) => assetsWithUrls.filter(({ asset }) => asset.category_id === categoryId && !asset.section_id);
  const assetsForSection = (sectionId: string) => assetsWithUrls.filter(({ asset }) => asset.section_id === sectionId);

  return (
    <main className="min-h-screen bg-[#eee7da] px-4 py-6 text-[#243126] sm:px-8 sm:py-10">
      <div className="print-controls mx-auto flex max-w-3xl items-center justify-between gap-3 pb-5">
        <Link href={`/admin/teachings/${id}/edit`} className="admin-secondary-button inline-flex items-center justify-center"><span>Back to Editor</span></Link>
        <PrintButton />
      </div>
      <article className="print-paper mx-auto max-w-3xl rounded-2xl bg-white p-7 shadow-xl shadow-[#4d5f52]/10 sm:p-12">
        <header className="border-b border-[#284a3b]/15 pb-8">
          <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#946332]">The Prayer Whiteboard</p>
          <h1 className="mt-3 text-4xl font-extrabold leading-tight tracking-tight text-[#243d31]">{teaching.title}</h1>
          {teaching.gathering_date ? <p className="mt-4 text-sm font-bold text-[#607066]">{formatDate(teaching.gathering_date)}</p> : null}
          {teaching.central_theme ? <p className="mt-5 text-lg font-bold text-[#385245]">{teaching.central_theme}</p> : null}
          {teaching.introduction ? <TextParagraphs text={teaching.introduction} className="mt-5 text-[#52645a]" /> : null}
          {teaching.summary ? <TextParagraphs text={teaching.summary} className="mt-5 text-[#52645a]" /> : null}
        </header>
        <div className="mt-8 space-y-6">
          {assetsForTeaching.map(({ asset, url }) => <PrintableChalkboard key={asset.id} asset={asset} url={url} />)}
        </div>
        <div className="mt-10 space-y-10">
          {orderedCategories.map((category) => (
            <section key={category.id} className="print-category">
              <h2 className="print-category-heading border-b border-[#284a3b]/15 pb-2 text-2xl font-extrabold text-[#243d31]">{category.title}</h2>
              <div className="mt-6 space-y-7">
                {assetsForCategory(category.id).map(({ asset, url }) => <PrintableChalkboard key={asset.id} asset={asset} url={url} />)}
              </div>
              <div className="mt-6 space-y-7">
                {category.sections.map((section) => <div key={section.id}><PrintableChalkboards assets={assetsForSection(section.id)} /><PrintableSection title={section.title} content={section.content} /></div>)}
              </div>
            </section>
          ))}
        </div>
      </article>
    </main>
  );
}

function PrintableSection({ title, content }: { title: string; content: unknown }) {
  const value = content && typeof content === "object" ? content as Content : {};
  const callout = normalizeCallout(value.callout);
  const showTitle = value.showTitle !== false;
  const body = <div className="print-section-content mt-3 text-[#52645a]"><SectionContent value={value} /></div>;

  if (!callout || !callout.enabled) {
    return (
      <section className="print-section">
        {showTitle ? <h3 className="print-section-heading text-lg font-extrabold text-[#385245]">{title}</h3> : null}
        {body}
      </section>
    );
  }

  const label = getCalloutLabel(callout);
  return (
    <section className="print-section">
      <div className="mt-3 rounded-xl px-4 py-3 text-sm" style={getCalloutStyles(callout.color, callout.style)}>
        {label ? <div className="text-xs font-extrabold uppercase tracking-[0.14em]">{label}</div> : null}
        {showTitle ? <h3 className="print-section-heading mt-2 text-lg font-extrabold text-[#385245]">{title}</h3> : null}
        <div className="print-section-content mt-3 text-[#52645a]">{body.props.children}</div>
      </div>
    </section>
  );
}

function SectionContent({ value }: { value: Content }) {
  if (value.format === "bullets" && Array.isArray(value.bullets)) return <><TextParagraphs text={value.introduction} /><ul className="print-bullet-list mt-3 list-disc space-y-2 pl-6">{value.bullets.map((bullet) => <li key={String(bullet)}>{String(bullet)}</li>)}</ul><TextParagraphs text={value.conclusion} className="mt-3" /></>;
  if (value.format === "scripture") return <div className="print-scripture"><TextParagraphs text={value.introduction} /><p className="mt-3 font-bold text-[#385245]">{String(value.reference ?? "")}{value.translation ? <span className="ml-2 font-normal text-[#607066]">({String(value.translation)})</span> : null}</p><div className="mt-2 italic"><TextParagraphs text={value.quotation} /></div></div>;
  return <TextParagraphs text={value.text} className={value.format === "takeaway" ? "font-bold text-[#385245]" : undefined} />;
}

function TextParagraphs({ text, className }: { text: unknown; className?: string }) {
  const paragraphs = String(text ?? "").replace(/\r\n?/g, "\n").split("\n").map((paragraph) => paragraph.trim()).filter(Boolean);
  return <div className={`space-y-3 ${className ?? ""}`}>{paragraphs.map((paragraph, index) => <p key={`${index}-${paragraph.slice(0, 20)}`} className="whitespace-pre-wrap">{paragraph}</p>)}</div>;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}

function PrintableChalkboards({ assets }: { assets: { asset: ChalkboardAsset; url: string | null }[] }) {
  return <>{assets.map(({ asset, url }) => <PrintableChalkboard key={asset.id} asset={asset} url={url} />)}</>;
}

function PrintableChalkboard({ asset, url }: { asset: ChalkboardAsset; url: string | null }) {
  if (!url) return null;
  return (
    <figure className="print-chalkboard">
      <img src={url} alt={asset.alt_text} className="mx-auto block h-auto max-h-[850px] w-full max-w-[540px] object-contain" />
      {asset.caption?.trim() ? <figcaption className="mt-3 text-center text-sm text-[#607066]">{asset.caption.trim()}</figcaption> : null}
    </figure>
  );
}