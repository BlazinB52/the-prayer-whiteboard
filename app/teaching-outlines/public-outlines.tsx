import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Download, ListChecks } from "lucide-react";
import { PublicFooter } from "@/app/public-footer";
import { PublicFooterEs } from "@/app/public-footer-es";
import { PublicHeader } from "@/app/public-header";
import { ReturnToTop } from "@/app/return-to-top";
import { OutlineContent } from "@/app/teaching-outlines/outline-content";
import { createClient } from "@/lib/supabase/server";
import { OUTLINE_BUCKET, type OutlineBlock } from "@/lib/teaching-outlines";

// Shared by the English (/teacher-resources) and Español
// (/espanol/recursos-para-maestros) pages so each side shows only its own
// language and none of the other's text.

export type OutlineLanguage = "en" | "es";

const COPY = {
  en: {
    lang: "en",
    basePath: "/teacher-resources",
    eyebrow: "Teacher Resources",
    heading: "Teaching Outlines",
    intro: "Printable outlines to help you teach and lead discussion. Choose a category, open an outline to read it online, or download the Word file to adapt for your group.",
    empty: "Teaching outlines are being prepared. Please check back soon.",
    loadError: "Teaching outlines could not be loaded right now. Please try again later.",
    taught: "Taught",
    open: "Open outline",
    back: "All teacher resources",
    download: "Download Word file",
    relatedTeaching: "Read the related teaching",
    category: "Category",
    nav: [
      { href: "/", label: "Home" },
      { href: "/devotionals#revisit", label: "Devotionals" },
      { href: "/points-of-agreement", label: "Prayer Guide" },
      { href: "/subscribe", label: "Email Updates" },
    ],
    dateLocale: "en-US",
  },
  es: {
    lang: "es",
    basePath: "/espanol/recursos-para-maestros",
    eyebrow: "Recursos para maestros",
    heading: "Bosquejos de enseñanza",
    intro: "Bosquejos para ayudarte a enseñar y a guiar la conversación. Elegí una categoría, abrí un bosquejo para leerlo en línea o descargá el archivo de Word para adaptarlo a tu grupo.",
    empty: "Estamos preparando los bosquejos de enseñanza. Volvé pronto.",
    loadError: "No se pudieron cargar los bosquejos en este momento. Intentá de nuevo más tarde.",
    taught: "Enseñado el",
    open: "Abrir bosquejo",
    back: "Todos los recursos para maestros",
    download: "Descargar archivo de Word",
    relatedTeaching: "Leé la enseñanza relacionada",
    category: "Categoría",
    nav: [
      { href: "/espanol", label: "Inicio" },
      { href: "/", label: "English" },
    ],
    dateLocale: "es",
  },
} as const;

type CategoryRow = { id: string; name: string; name_es: string | null };
type ListRow = { id: string; slug: string; title: string; subtitle: string | null; category_id: string; gathering_date: string | null };

function formatDate(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}

function Shell({ language, children, width = "max-w-5xl" }: { language: OutlineLanguage; children: React.ReactNode; width?: string }) {
  const copy = COPY[language];
  return (
    <main lang={copy.lang} className="min-h-screen bg-[#f7f2e8] text-[#243126]">
      <PublicHeader variant={language} maxWidthClassName={width} nav={[...copy.nav]} />
      {children}
      {language === "es" ? <PublicFooterEs /> : <PublicFooter />}
      <ReturnToTop />
    </main>
  );
}

export async function OutlineLibraryPage({ language }: { language: OutlineLanguage }) {
  const copy = COPY[language];
  const supabase = await createClient();
  const [categoriesResult, outlinesResult] = await Promise.all([
    supabase.from("outline_categories").select("id, name, name_es").order("sort_order", { ascending: true }).order("name", { ascending: true }),
    supabase
      .from("teaching_outlines")
      .select("id, slug, title, subtitle, category_id, gathering_date")
      .eq("status", "published")
      .eq("language", language)
      .order("gathering_date", { ascending: false, nullsFirst: false })
      .order("title", { ascending: true }),
  ]);

  const failed = Boolean(categoriesResult.error || outlinesResult.error);
  const categories = (categoriesResult.data as CategoryRow[] | null) ?? [];
  const outlines = (outlinesResult.data as ListRow[] | null) ?? [];
  const groups = categories
    .map((category) => ({ category, rows: outlines.filter((outline) => outline.category_id === category.id) }))
    .filter((group) => group.rows.length);

  return (
    <Shell language={language}>
      <section className="bg-[#20382e] px-5 py-12 text-[#f8f1df] sm:px-8 sm:py-16">
        <div className="mx-auto max-w-5xl">
          <span className="grid size-12 place-items-center rounded-2xl bg-[#f0cb83] text-[#20382e]"><ListChecks aria-hidden="true" size={25} /></span>
          <p className="mt-6 text-xs font-extrabold uppercase tracking-[0.2em] text-[#f0cb83]">{copy.eyebrow}</p>
          <h1 className="mt-3 text-4xl font-extrabold leading-tight tracking-tight text-white sm:text-6xl">{copy.heading}</h1>
          <p className="mt-6 max-w-3xl text-lg leading-8 text-[#dce8e1]">{copy.intro}</p>
        </div>
      </section>

      <section className="px-5 py-12 sm:px-8 sm:py-16">
        <div className="mx-auto max-w-5xl space-y-12">
          {failed ? <p className="text-[#a2472c]">{copy.loadError}</p> : null}
          {!failed && !groups.length ? <p className="text-lg text-[#52645a]">{copy.empty}</p> : null}
          {groups.map(({ category, rows }) => (
            <div key={category.id}>
              <h2 className="text-sm font-black uppercase tracking-[0.18em] text-[#946332]">{language === "es" ? category.name_es || category.name : category.name}</h2>
              <ul className="mt-4 grid gap-4 md:grid-cols-2">
                {rows.map((outline) => (
                  <li key={outline.id}>
                    <Link href={`${copy.basePath}/${outline.slug}`} className="group flex h-full flex-col rounded-2xl border border-[#284a3b]/10 bg-[#fffdf8] p-6 shadow-lg shadow-[#4d5f52]/8 transition hover:-translate-y-0.5 hover:border-[#a85e32]/30">
                      <h3 className="text-xl font-extrabold leading-snug text-[#243d31]">{outline.title}</h3>
                      {outline.subtitle ? <p className="mt-1 text-xs font-bold uppercase tracking-wider text-[#607066]">{outline.subtitle}</p> : null}
                      {outline.gathering_date ? <p className="mt-3 text-sm text-[#607066]">{copy.taught} {formatDate(outline.gathering_date, copy.dateLocale)}</p> : null}
                      <span className="mt-5 inline-flex items-center gap-2 text-sm font-extrabold text-[#946332] group-hover:text-[#a85e32]">{copy.open} <ArrowRight aria-hidden="true" size={16} /></span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </Shell>
  );
}

type OutlineDetail = {
  title: string;
  subtitle: string | null;
  content: OutlineBlock[];
  gathering_date: string | null;
  source_path: string;
  source_file_name: string | null;
  outline_categories: CategoryRow | CategoryRow[] | null;
  teachings: { slug: string; title: string; language: string } | { slug: string; title: string; language: string }[] | null;
};

const DETAIL_SELECT = "title, subtitle, content, gathering_date, source_path, source_file_name, outline_categories(id, name, name_es), teachings(slug, title, language)";

export async function getPublishedOutlineMetadata(slug: string, language: OutlineLanguage) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("teaching_outlines")
    .select("title, subtitle")
    .eq("slug", slug)
    .eq("status", "published")
    .eq("language", language)
    .maybeSingle();
  return data as { title: string; subtitle: string | null } | null;
}

export async function OutlineDetailPage({ slug, language }: { slug: string; language: OutlineLanguage }) {
  const copy = COPY[language];
  const supabase = await createClient();
  const { data } = await supabase
    .from("teaching_outlines")
    .select(DETAIL_SELECT)
    .eq("slug", slug)
    .eq("status", "published")
    .eq("language", language)
    .maybeSingle();
  if (!data) notFound();

  const outline = data as unknown as OutlineDetail;
  const category = Array.isArray(outline.outline_categories) ? outline.outline_categories[0] : outline.outline_categories;
  const related = Array.isArray(outline.teachings) ? outline.teachings[0] : outline.teachings;
  const downloadHref = supabase.storage
    .from(OUTLINE_BUCKET)
    .getPublicUrl(outline.source_path, { download: outline.source_file_name ?? "outline.docx" }).data.publicUrl;
  const categoryName = category ? (language === "es" ? category.name_es || category.name : category.name) : null;

  return (
    <Shell language={language} width="max-w-4xl">
      <article className="mx-auto max-w-4xl px-5 py-10 sm:px-8 sm:py-14">
        <Link href={copy.basePath} className="text-sm font-extrabold text-[#946332] hover:text-[#a85e32]">&larr; {copy.back}</Link>
        <header className="mt-6 border-b border-[#284a3b]/10 pb-7">
          {categoryName ? <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#946332]">{categoryName}</p> : null}
          <h1 className="mt-3 text-4xl font-extrabold leading-tight tracking-tight text-[#243d31] sm:text-5xl">{outline.title}</h1>
          {outline.subtitle ? <p className="mt-2 text-sm font-bold uppercase tracking-wider text-[#607066]">{outline.subtitle}</p> : null}
          {outline.gathering_date ? <p className="mt-3 text-sm text-[#607066]">{copy.taught} {formatDate(outline.gathering_date, copy.dateLocale)}</p> : null}
          <div className="mt-5 flex flex-wrap gap-3 print:hidden">
            <a href={downloadHref} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#244a3a] px-4 text-sm font-extrabold !text-white hover:bg-[#1d3d30]">
              <Download aria-hidden="true" size={16} /> {copy.download}
            </a>
            {related ? (
              <Link href={`/teachings/${related.slug}`} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#284a3b]/15 bg-white px-4 text-sm font-extrabold text-[#244a3a] hover:border-[#a85e32]/40 hover:text-[#a85e32]">
                {copy.relatedTeaching}: {related.title} <ArrowRight aria-hidden="true" size={16} />
              </Link>
            ) : null}
          </div>
        </header>
        <div className="py-4">
          <OutlineContent blocks={outline.content} />
        </div>
      </article>
    </Shell>
  );
}
