import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/supabase/admin";
import { getCalloutLabel, getCalloutStyles, normalizeCallout } from "../../callout-utils";
import { PrintButton } from "./print-button";

export const metadata: Metadata = {
  title: "Printable Teaching Preview",
  robots: { index: false, follow: false },
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Content = Record<string, unknown>;

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

  if (categoriesError || sectionsError) notFound();
  if ((categories ?? []).some((category) => category.teaching_id !== teaching.id) || (sections ?? []).some((section) => section.teaching_id !== teaching.id)) notFound();

  const orderedCategories = (categories ?? []).map((category) => ({
    ...category,
    sections: (sections ?? []).filter((section) => section.category_id === category.id),
  }));

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
        <div className="mt-10 space-y-10">
          {orderedCategories.map((category) => (
            <section key={category.id} className="print-category">
              <h2 className="print-category-heading border-b border-[#284a3b]/15 pb-2 text-2xl font-extrabold text-[#243d31]">{category.title}</h2>
              <div className="mt-6 space-y-7">
                {category.sections.map((section) => <PrintableSection key={section.id} title={section.title} content={section.content} />)}
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
  const body = <div className="print-section-content mt-3 text-[#52645a]"><SectionContent value={value} /></div>;
  if (!callout || !callout.enabled) return <section className="print-section"><h3 className="print-section-heading text-lg font-extrabold text-[#385245]">{title}</h3>{body}</section>;

  const label = getCalloutLabel(callout);
  return (
    <section className="print-section">
      <div className="mt-3 rounded-xl px-4 py-3 text-sm" style={getCalloutStyles(callout.color, callout.style)}>
        {label ? <div className="text-xs font-extrabold uppercase tracking-[0.14em]">{label}</div> : null}
        <h3 className="print-section-heading mt-2 text-lg font-extrabold text-[#385245]">{title}</h3>
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