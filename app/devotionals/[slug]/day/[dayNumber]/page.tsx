import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { notFound } from "next/navigation";
import { DevotionalTextBlock } from "@/app/devotional-text-block";
import { formatInlineText } from "@/app/formatted-text";
import { PublicFooter } from "@/app/public-footer";
import { PublicFooterEs } from "@/app/public-footer-es";
import { PublicHeader } from "@/app/public-header";
import { ReturnToTop } from "@/app/return-to-top";
import type { DevotionalDay } from "@/lib/devotionals";
import { getDevotionalDayDescription, getPublishedDevotionalSeriesBySlug } from "@/lib/public-devotionals";
import { toLanguage, ui } from "@/lib/i18n";
import { NOINDEX } from "@/lib/seo";
import { createClient } from "@/lib/supabase/server";

// The canonical per-day page, addressed by the devotional's own slug. The
// teaching-scoped route stays in place for existing links; this one is what the
// daily email points at, so a series shared between teachings has one address.

function parseDayNumber(value: string) {
  const dayNumber = Number(value);
  return Number.isInteger(dayNumber) && dayNumber >= 1 && dayNumber <= 7 ? dayNumber : null;
}

async function loadDay(slug: string, dayNumber: number) {
  const series = await getPublishedDevotionalSeriesBySlug(slug);
  if (!series) return null;

  const supabase = await createClient();
  const { data: day, error } = await supabase
    .from("teaching_devotional_days")
    .select("id, devotional_id, day_number, title, anchor_scriptures, devotional_reading, confession, journal_prompt, prayer_activation")
    .eq("devotional_id", series.id)
    .eq("day_number", dayNumber)
    .maybeSingle();

  if (error || !day) return null;
  return { series, day };
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string; dayNumber: string }> }): Promise<Metadata> {
  const { slug, dayNumber: dayNumberParam } = await params;
  const dayNumber = parseDayNumber(dayNumberParam);
  const fallback: Metadata = { title: "Devotional", robots: NOINDEX };
  if (!dayNumber) return fallback;

  const resolved = await loadDay(slug, dayNumber);
  if (!resolved) return fallback;

  return {
    title: `${ui(toLanguage(resolved.series.language)).dayFallback(dayNumber)}: ${resolved.day.title} | ${resolved.series.title}`,
    description: getDevotionalDayDescription(resolved.day, resolved.series),
    alternates: { canonical: `/devotionals/${resolved.series.slug}/day/${dayNumber}` },
  };
}

export default async function PublicDevotionalDayPage({ params }: { params: Promise<{ slug: string; dayNumber: string }> }) {
  const { slug, dayNumber: dayNumberParam } = await params;
  const dayNumber = parseDayNumber(dayNumberParam);
  if (!dayNumber) notFound();

  const resolved = await loadDay(slug, dayNumber);
  if (!resolved) notFound();

  const { series, day } = resolved;
  const language = toLanguage(series.language);
  const t = ui(language);

  return (
    <main lang={language} className="min-h-screen bg-[#f7f2e8] text-[#243126]">
      <PublicHeader variant={language} maxWidthClassName="max-w-3xl" end={<Link href={`/devotionals/${slug}`} className="shrink-0 text-sm font-extrabold text-[#244a3a]">{t.devotionalOverview}</Link>} />
      <article className="mx-auto max-w-3xl px-5 py-10 sm:px-8 sm:py-16">
        <header className="border-b border-[#284a3b]/15 pb-8">
          <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#946332]">{t.dayOfSeven(dayNumber)}</p>
          <h1 className="mt-3 text-4xl font-extrabold leading-tight tracking-tight text-[#243d31] sm:text-5xl">{day.title}</h1>
          <p className="mt-4 text-sm font-bold text-[#607066]">{series.title}</p>
        </header>
        <div className="mt-8 space-y-8">
          <DevotionalField title={t.anchorScriptures}>
            <ul className="list-disc space-y-2 pl-6">{(day as DevotionalDay).anchor_scriptures.map((scripture) => <li key={scripture}>{formatInlineText(scripture, { links: true })}</li>)}</ul>
          </DevotionalField>
          <DevotionalField title={t.devotionalReading}><DevotionalTextBlock text={day.devotional_reading} /></DevotionalField>
          <DevotionalField title={t.confession}><DevotionalTextBlock text={day.confession} /></DevotionalField>
          <DevotionalField title={t.journalPrompt}><DevotionalTextBlock text={day.journal_prompt} /></DevotionalField>
          <DevotionalField title={t.prayerActivation}><DevotionalTextBlock text={day.prayer_activation} /></DevotionalField>
        </div>
        <nav className="mt-12 flex flex-col gap-3 border-t border-[#284a3b]/15 pt-6 sm:flex-row sm:items-center sm:justify-between">
          {dayNumber > 1 ? <Link href={`/devotionals/${slug}/day/${dayNumber - 1}`} className="inline-flex items-center gap-2 font-extrabold text-[#9d5a2f]"><ArrowLeft aria-hidden="true" size={18} /> {t.previousDay}</Link> : <span />}
          {dayNumber < 7 ? <Link href={`/devotionals/${slug}/day/${dayNumber + 1}`} className="inline-flex items-center gap-2 font-extrabold text-[#9d5a2f]">{t.nextDay} <ArrowRight aria-hidden="true" size={18} /></Link> : null}
        </nav>
        <div className="mt-6 flex flex-wrap gap-4 text-sm font-extrabold text-[#244a3a]">
          <Link href={`/devotionals/${slug}`}>{t.returnToOverview}</Link>
          {series.teaching ? <Link href={`/teachings/${series.teaching.slug}`}>{t.returnToTeaching}</Link> : null}
        </div>
      </article>
      {language === "es" ? <PublicFooterEs /> : <PublicFooter />}
      <ReturnToTop />
    </main>
  );
}

function DevotionalField({ title, children }: { title: string; children: ReactNode }) {
  return <section className="rounded-2xl border border-[#284a3b]/10 bg-[#fffdf8] p-6"><h2 className="text-xl font-extrabold text-[#243d31]">{title}</h2><div className="mt-4 text-base leading-8 text-[#52645a]">{children}</div></section>;
}
