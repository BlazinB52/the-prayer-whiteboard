import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpenCheck, CalendarDays } from "lucide-react";
import { PublicFooter } from "@/app/public-footer";
import { PublicHeader } from "@/app/public-header";
import { ReturnToTop } from "@/app/return-to-top";
import {
  getDevotionalDescription,
  getDevotionalPath,
  getDevotionalReadPath,
  getDevotionalSignupCopy,
  getDevotionalStartLabel,
  getDevotionalStartPath,
  getPublishedDevotionalSeries,
  type PublicDevotionalSeries,
} from "@/lib/public-devotionals";

export const metadata: Metadata = {
  title: "7-Day Devotionals | The Whiteboard",
  description:
    "Browse Prayer Whiteboard 7-day devotional series and start receiving devotional emails.",
};

export default async function DevotionalsPage() {
  const series = await getPublishedDevotionalSeries();
  const featured = series[0];

  return (
    <main className="min-h-screen overflow-hidden bg-[#f7f2e8] text-[#243126]">
      <PublicHeader maxWidthClassName="max-w-6xl" />
      <section className="relative">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_85%_12%,rgba(209,159,83,0.22),transparent_28%),radial-gradient(circle_at_8%_75%,rgba(58,103,79,0.15),transparent_30%)]" />
        <div className="relative mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-16 lg:py-20">
          {featured ? <FeaturedDevotional series={featured} /> : <NoDevotionalsMessage />}
        </div>
      </section>
      <section className="bg-[#244a3a] px-5 py-10 text-white sm:px-8 sm:py-12">
        <div className="mx-auto grid max-w-6xl gap-6 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#f0cb83]">
              Stay with the series
            </p>
            <p className="mt-3 max-w-3xl text-base leading-7 text-[#dce8e1]">
              Receive devotional emails each morning during an active 7-day series.
            </p>
          </div>
          <Link href={featured ? getDevotionalStartPath(featured) : "/devotionals/start"} className="inline-flex min-h-13 items-center justify-center gap-2 rounded-2xl bg-[#f1c66f] px-6 text-base font-extrabold text-[#244a3a] shadow-xl shadow-black/10 transition hover:-translate-y-0.5 hover:bg-[#f5d58d]">
            Subscribe <ArrowRight aria-hidden="true" size={18} />
          </Link>
        </div>
      </section>
      <section className="border-y border-[#284a3b]/10 bg-[#eee7da] px-5 py-14 sm:px-8 sm:py-20">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#946332]">
                Revisit the journey
              </p>
              <h2 className="mt-2 text-4xl font-extrabold tracking-tight text-[#243d31]">
                Previous 7-Day Devotionals
              </h2>
            </div>
            <p className="max-w-md text-sm leading-6 text-[#607066]">
              Devotional series stay here so they remain easy to revisit as new series are added.
            </p>
          </div>
          {series.length ? (
            <div className="mt-8 grid gap-4 md:grid-cols-3">
              {series.map((item, index) => (
                <DevotionalArchiveCard key={item.id} series={item} isCurrent={index === 0} />
              ))}
            </div>
          ) : (
            <p className="mt-8 rounded-2xl border border-dashed border-[#284a3b]/20 bg-[#fffdf8] p-6 leading-7 text-[#607066]">
              No published devotional series are available yet.
            </p>
          )}
        </div>
      </section>
      <PublicFooter />
      <ReturnToTop />
    </main>
  );
}

function NoDevotionalsMessage() {
  return (
    <div className="max-w-3xl">
      <p className="inline-flex items-center gap-2 rounded-full border border-[#b98243]/25 bg-[#fffaf0] px-4 py-2 text-xs font-extrabold uppercase tracking-[0.16em] text-[#875624]">
        <BookOpenCheck aria-hidden="true" size={15} />
        Current Devotional
      </p>
      <h1 className="mt-5 text-4xl font-extrabold leading-[1.02] tracking-tight text-[#20382e] sm:mt-6 sm:text-6xl sm:leading-[0.98]">
        7-Day Devotionals
      </h1>
      <p className="mt-3 max-w-2xl text-base leading-7 text-[#52645a] sm:mt-5 sm:text-lg sm:leading-8">
        No published devotional series are available yet.
      </p>
    </div>
  );
}

function FeaturedDevotional({ series }: { series: PublicDevotionalSeries }) {
  const description = getDevotionalDescription(series);

  return (
    <div className="max-w-3xl">
      <p className="inline-flex items-center gap-2 rounded-full border border-[#b98243]/25 bg-[#fffaf0] px-4 py-2 text-xs font-extrabold uppercase tracking-[0.16em] text-[#875624]">
        <BookOpenCheck aria-hidden="true" size={15} />
        Current Devotional
      </p>
      <h1 className="mt-5 text-4xl font-extrabold leading-[1.02] tracking-tight text-[#20382e] sm:mt-6 sm:text-6xl sm:leading-[0.98]">
        {series.title}
      </h1>
      <p className="mt-3 max-w-2xl text-base leading-7 text-[#52645a] sm:mt-5 sm:text-lg sm:leading-8">
        {description.length > 190 ? `${description.slice(0, 187).trim()}...` : description}
      </p>
      <Link href={getDevotionalStartPath(series)} className="mt-5 inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#244a3a] px-6 text-base font-extrabold !text-white shadow-xl shadow-[#244a3a]/20 transition hover:-translate-y-0.5 hover:bg-[#1d3d30] hover:!text-white focus-visible:!text-white visited:!text-white sm:w-auto">
        {getDevotionalStartLabel(series)} <ArrowRight aria-hidden="true" size={19} />
      </Link>
      <p className="mt-4 max-w-2xl whitespace-pre-line text-sm font-bold leading-6 text-[#385245] sm:text-base sm:leading-7">
        {getDevotionalSignupCopy(series)}
      </p>
      <Link href={getDevotionalReadPath(series)} className="mt-4 inline-flex items-center gap-2 text-sm font-extrabold text-[#9d5a2f] underline-offset-4 transition hover:text-[#a85e32] hover:underline">
        Prefer to read online? Open the devotional <ArrowRight aria-hidden="true" size={17} />
      </Link>
    </div>
  );
}

function DevotionalArchiveCard({ series, isCurrent }: { series: PublicDevotionalSeries; isCurrent: boolean }) {
  return (
    <article className="flex min-h-[260px] flex-col rounded-3xl border border-[#284a3b]/10 bg-[#fffdf8] p-6">
      <div className="flex items-start justify-between gap-3">
        <span className="inline-flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.12em] text-[#9b6531]">
          <CalendarDays aria-hidden="true" size={16} /> 7 days
        </span>
        <span className="rounded-full bg-[#e7efe9] px-3 py-1 text-[10px] font-black uppercase tracking-wider text-[#326048]">
          {isCurrent ? "Current" : "Previous"}
        </span>
      </div>
      <h3 className="mt-5 text-xl font-extrabold leading-7 text-[#263e33]">
        {series.title}
      </h3>
      <p className="mt-3 text-sm leading-6 text-[#66746c]">
        {getDevotionalDescription(series)}
      </p>
      <Link href={getDevotionalPath(series)} className="mt-auto inline-flex items-center gap-2 pt-6 text-sm font-extrabold text-[#9d5a2f]">
        Open devotional <ArrowRight aria-hidden="true" size={17} />
      </Link>
    </article>
  );
}
