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
        <SubscribeForm devotional={devotional ? { slug: devotional.slug, title: devotional.title } : null} />
      </section>
      <PublicFooter />
      <ReturnToTop />
    </main>
  );
}
