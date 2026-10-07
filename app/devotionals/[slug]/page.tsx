import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpenCheck } from "lucide-react";
import { notFound } from "next/navigation";
import { PublicFooter } from "@/app/public-footer";
import { PublicFooterEs } from "@/app/public-footer-es";
import { formatInlineText } from "@/app/formatted-text";
import { PublicHeader } from "@/app/public-header";
import { ReturnToTop } from "@/app/return-to-top";
import { toLanguage, ui } from "@/lib/i18n";
import { NOINDEX, truncateDescription } from "@/lib/seo";
import { buildPageMetadata, devotionalOverviewTitle, otherLanguagePath } from "@/lib/alternates";
import { getDevotionalPair } from "@/lib/translations";
import { TranslationLink } from "@/app/translation-link";
import {
  getDevotionalDescription,
  getDevotionalSignupCopy,
  getDevotionalStartLabel,
  getDevotionalStartPath,
  getPublishedDevotionalSeriesBySlug,
} from "@/lib/public-devotionals";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const series = await getPublishedDevotionalSeriesBySlug(slug);

  if (!series) return { title: "Devotional", robots: NOINDEX };

  const language = toLanguage(series.language);
  return buildPageMetadata({
    title: devotionalOverviewTitle(series.title, ui(language).sevenDayDevotional),
    description: truncateDescription(getDevotionalDescription(series)),
    path: `/devotionals/${series.slug}`,
    language,
    pair: await getDevotionalPair(series.slug, language),
  });
}

export default async function PublicDevotionalPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const series = await getPublishedDevotionalSeriesBySlug(slug);

  if (!series) notFound();

  const description = getDevotionalDescription(series);
  const language = toLanguage(series.language);
  const t = ui(language);
  const twinHref = otherLanguagePath(await getDevotionalPair(series.slug, language), language);

  return (
    <main lang={language} className="min-h-screen overflow-hidden bg-[#f7f2e8] text-[#243126]">
      <PublicHeader variant={language} maxWidthClassName="max-w-4xl" />
      <article className="mx-auto max-w-4xl px-5 py-10 sm:px-8 sm:py-16">
        {twinHref ? <p className="mb-6"><TranslationLink href={twinHref} target={language === "es" ? "en" : "es"} /></p> : null}
        <header className="border-b border-[#284a3b]/15 pb-8">
          <p className="inline-flex items-center gap-2 rounded-full border border-[#b98243]/25 bg-[#fffaf0] px-4 py-2 text-xs font-extrabold uppercase tracking-[0.16em] text-[#875624]">
            <BookOpenCheck aria-hidden="true" size={15} />
            {t.sevenDayDevotional}
          </p>
          <h1 className="mt-5 text-3xl font-extrabold leading-tight tracking-tight text-[#243d31] sm:text-4xl">
            {series.title}
          </h1>
          <p className="mt-6 text-lg leading-8 text-[#52645a]">{formatInlineText(description)}</p>
          {language === "es" ? null : <Link href={getDevotionalStartPath(series)} className="mt-5 inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#244a3a] px-6 text-base font-extrabold !text-white shadow-xl shadow-[#244a3a]/20 transition hover:-translate-y-0.5 hover:bg-[#1d3d30] hover:!text-white focus-visible:!text-white visited:!text-white sm:w-auto">
            {getDevotionalStartLabel(series)} <ArrowRight aria-hidden="true" size={19} />
          </Link>}
          {language === "es" ? null : <p className="mt-4 max-w-2xl whitespace-pre-line text-sm font-bold leading-6 text-[#385245] sm:text-base sm:leading-7">
            {getDevotionalSignupCopy(series)}
          </p>}
        </header>
        {/* This page is the canonical address, so "open" goes to day one rather than back to itself. */}
        <Link href={`/devotionals/${series.slug}/day/1`} className="mt-8 inline-flex items-center gap-2 text-sm font-extrabold text-[#9d5a2f] underline-offset-4 transition hover:text-[#a85e32] hover:underline">
          {series.teaching ? t.openDevotionalOnline : t.startDayOneOnline} <ArrowRight aria-hidden="true" size={17} />
        </Link>
      </article>
      {language === "es" ? <PublicFooterEs englishHref={twinHref} /> : <PublicFooter spanishHref={twinHref} />}
      <ReturnToTop />
    </main>
  );
}
