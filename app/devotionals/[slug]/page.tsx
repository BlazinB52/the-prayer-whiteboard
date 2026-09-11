import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpenCheck } from "lucide-react";
import { notFound } from "next/navigation";
import { PublicFooter } from "@/app/public-footer";
import { PublicHeader } from "@/app/public-header";
import { ReturnToTop } from "@/app/return-to-top";
import {
  getDevotionalDescription,
  getDevotionalReadPath,
  getDevotionalSignupCopy,
  getDevotionalStartLabel,
  getDevotionalStartPath,
  getPublishedDevotionalSeriesBySlug,
} from "@/lib/public-devotionals";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const series = await getPublishedDevotionalSeriesBySlug(slug);

  if (!series) return { title: "Devotional | The Whiteboard", robots: { index: false, follow: false } };

  return {
    title: `${series.title} | 7-Day Devotional`,
    description: getDevotionalDescription(series),
  };
}

export default async function PublicDevotionalPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const series = await getPublishedDevotionalSeriesBySlug(slug);

  if (!series) notFound();

  const description = getDevotionalDescription(series);

  return (
    <main className="min-h-screen overflow-hidden bg-[#f7f2e8] text-[#243126]">
      <PublicHeader maxWidthClassName="max-w-4xl" />
      <article className="mx-auto max-w-4xl px-5 py-10 sm:px-8 sm:py-16">
        <header className="border-b border-[#284a3b]/15 pb-8">
          <p className="inline-flex items-center gap-2 rounded-full border border-[#b98243]/25 bg-[#fffaf0] px-4 py-2 text-xs font-extrabold uppercase tracking-[0.16em] text-[#875624]">
            <BookOpenCheck aria-hidden="true" size={15} />
            7-Day Devotional
          </p>
          <h1 className="mt-5 text-4xl font-extrabold leading-tight tracking-tight text-[#243d31] sm:text-6xl">
            {series.title}
          </h1>
          <p className="mt-4 text-sm font-bold text-[#607066]">For {series.teaching.title}</p>
          <p className="mt-6 text-lg leading-8 text-[#52645a]">{description}</p>
          <Link href={getDevotionalStartPath(series)} className="mt-5 inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#244a3a] px-6 text-base font-extrabold !text-white shadow-xl shadow-[#244a3a]/20 transition hover:-translate-y-0.5 hover:bg-[#1d3d30] hover:!text-white focus-visible:!text-white visited:!text-white sm:w-auto">
            {getDevotionalStartLabel(series)} <ArrowRight aria-hidden="true" size={19} />
          </Link>
          <p className="mt-4 max-w-2xl whitespace-pre-line text-sm font-bold leading-6 text-[#385245] sm:text-base sm:leading-7">
            {getDevotionalSignupCopy(series)}
          </p>
        </header>
        <Link href={getDevotionalReadPath(series)} className="mt-8 inline-flex items-center gap-2 text-sm font-extrabold text-[#9d5a2f] underline-offset-4 transition hover:text-[#a85e32] hover:underline">
          Prefer to read online? Open the devotional <ArrowRight aria-hidden="true" size={17} />
        </Link>
      </article>
      <PublicFooter />
      <ReturnToTop />
    </main>
  );
}
