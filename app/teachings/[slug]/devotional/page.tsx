import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { notFound } from "next/navigation";
import { DevotionalTextBlock } from "@/app/devotional-text-block";
import { PublicFooter } from "@/app/public-footer";
import { PublicFooterEs } from "@/app/public-footer-es";
import { PublicHeader } from "@/app/public-header";
import { ReturnToTop } from "@/app/return-to-top";
import { DEVOTIONAL_DAY_NUMBERS, splitParagraphs, type DevotionalDay } from "@/lib/devotionals";
import { getPublishedDevotionalSeriesByTeachingSlug } from "@/lib/public-devotionals";
import { toLanguage, ui } from "@/lib/i18n";
import { NOINDEX, truncateDescription } from "@/lib/seo";
import { buildPageMetadata, devotionalOverviewTitle, otherLanguagePath } from "@/lib/alternates";
import { getDevotionalPair } from "@/lib/translations";
import { TranslationLink } from "@/app/translation-link";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const devotional = await getPublishedDevotionalSeriesByTeachingSlug(slug);
  if (!devotional) return { title: "Devotional", robots: NOINDEX };

  const language = toLanguage(devotional.language);
  // The series lives at /devotionals/[slug]; this teaching-scoped URL is a duplicate of it, so the
  // canonical, og:url and language alternates all describe that address.
  return buildPageMetadata({
    title: devotionalOverviewTitle(devotional.title, ui(language).sevenDayDevotional),
    description: truncateDescription(splitParagraphs(devotional.introduction)[0] ?? (language === "es" ? `Un devocional de 7 días para ${devotional.teaching.title}.` : `A 7-Day Devotional for ${devotional.teaching.title}.`)),
    path: `/devotionals/${devotional.slug}`,
    language,
    pair: await getDevotionalPair(devotional.slug, language),
  });
}

export default async function DevotionalOverviewPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const devotional = await getPublishedDevotionalSeriesByTeachingSlug(slug);
  if (!devotional) notFound();

  const supabase = await createClient();
  const { data: days, error: daysError } = await supabase
    .from("teaching_devotional_days")
    .select("id, day_number, title, anchor_scriptures")
    .eq("devotional_id", devotional.id)
    .order("day_number", { ascending: true });

  if (daysError) notFound();
  const language = toLanguage(devotional.language);
  const t = ui(language);
  const twinHref = otherLanguagePath(await getDevotionalPair(devotional.slug, language), language);

  return (
    <main lang={language} className="min-h-screen bg-[#f7f2e8] text-[#243126]">
      <PublicHeader variant={language} maxWidthClassName="max-w-4xl" />
      <article className="mx-auto max-w-4xl px-5 py-10 sm:px-8 sm:py-16">
        {twinHref ? <p className="mb-6"><TranslationLink href={twinHref} target={language === "es" ? "en" : "es"} /></p> : null}
        <header className="border-b border-[#284a3b]/15 pb-8">
          <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#946332]">{t.sevenDayDevotional}</p>
          <h1 className="mt-3 text-4xl font-extrabold leading-tight tracking-tight text-[#243d31] sm:text-6xl">{devotional.title}</h1>
          <DevotionalTextBlock text={devotional.introduction} className="mt-6 text-lg leading-8 text-[#52645a]" />
        </header>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {DEVOTIONAL_DAY_NUMBERS.map((dayNumber) => {
            const day = (days ?? []).find((item) => item.day_number === dayNumber) as Pick<DevotionalDay, "day_number" | "title" | "anchor_scriptures"> | undefined;
            return (
              <Link key={dayNumber} href={`/teachings/${slug}/devotional/day/${dayNumber}`} className="group rounded-2xl border border-[#284a3b]/10 bg-[#fffdf8] p-5 shadow-sm shadow-[#4d5f52]/5 transition hover:-translate-y-0.5 hover:border-[#a85e32]/35">
                <span className="grid size-10 place-items-center rounded-full bg-[#244a3a] text-sm font-black text-[#f1c66f]">{dayNumber}</span>
                <h2 className="mt-4 text-xl font-extrabold text-[#243d31]">{day?.title || t.dayFallback(dayNumber)}</h2>
                {day?.anchor_scriptures?.length ? <p className="mt-3 text-sm font-bold text-[#607066]">{day.anchor_scriptures.join(", ")}</p> : null}
                <span className="mt-5 inline-flex items-center gap-2 text-sm font-extrabold text-[#9d5a2f]">{t.readDay(dayNumber)} <ArrowRight aria-hidden="true" size={16} className="transition group-hover:translate-x-1" /></span>
              </Link>
            );
          })}
        </div>
        <Link href={`/teachings/${slug}`} className="mt-10 inline-flex items-center gap-2 font-extrabold text-[#244a3a]">{t.returnToTeaching} <ArrowRight aria-hidden="true" size={18} /></Link>
      </article>
      {language === "es" ? <PublicFooterEs englishHref={twinHref} /> : <PublicFooter spanishHref={twinHref} />}
      <ReturnToTop />
    </main>
  );
}
