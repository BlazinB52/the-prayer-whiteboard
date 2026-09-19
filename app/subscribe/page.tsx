import type { Metadata } from "next";
import Link from "next/link";
import { PublicFooter } from "@/app/public-footer";
import { PublicHeader } from "@/app/public-header";
import { ReturnToTop } from "@/app/return-to-top";
import { getPublishedDevotionalSeriesBySlug } from "@/lib/public-devotionals";
import { SubscribeForm } from "./subscribe-form";

export const metadata: Metadata = {
  title: "Email Updates | The Prayer Whiteboard",
  description: "Choose the Prayer Whiteboard emails you would like to receive.",
};

export default async function SubscribePage({ searchParams }: { searchParams: Promise<{ devotional?: string; category?: string }> }) {
  const { devotional: requestedSlug, category } = await searchParams;
  const devotional = requestedSlug && category === "devotionals"
    ? await getPublishedDevotionalSeriesBySlug(requestedSlug)
    : null;

  return (
    <main className="min-h-screen bg-[#f7f2e8] text-[#243126]">
      <PublicHeader maxWidthClassName="max-w-4xl" end={<Link href="/" className="shrink-0 text-sm font-extrabold text-[#244a3a]">Home</Link>} />
      <section className="mx-auto max-w-4xl px-5 py-10 sm:px-8 sm:py-16">
        <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#946332]">Email Updates</p>
        <h1 className="mt-3 text-4xl font-extrabold tracking-tight text-[#243d31] sm:text-6xl">Choose Your Email Updates</h1>
        <p className="mt-5 max-w-2xl text-base leading-7 text-[#52645a]">
          Subscribe to the Prayer Whiteboard emails you want to receive. Choose Weekly Updates, new teachings, 7-Day Devotionals, or all of them.
        </p>
        {devotional ? (
          <p className="mt-4 max-w-2xl rounded-xl border border-[#326048]/20 bg-[#e7efe9] px-4 py-3 text-sm font-bold leading-6 text-[#385245]">
            You are starting <span className="text-[#243d31]">{devotional.title}</span>. Devotionals is preselected and includes this current 7-Day Devotional plus future 7-day devotional series. You can also choose Weekly Updates and Teachings below.
          </p>
        ) : null}
        <div className="mt-8">
          <SubscribeForm devotional={devotional ? { slug: devotional.slug, title: devotional.title } : null} />
        </div>
      </section>
      <PublicFooter />
      <ReturnToTop />
    </main>
  );
}
