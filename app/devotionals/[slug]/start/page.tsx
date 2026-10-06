import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import {
  getDevotionalStartPath,
  getPublishedDevotionalSeriesBySlug,
} from "@/lib/public-devotionals";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const series = await getPublishedDevotionalSeriesBySlug(slug);

  if (!series) return { title: "Start a Devotional", robots: { index: false, follow: false } };

  return {
    title: `Start ${series.title}`,
    description: `Subscribe to receive ${series.title} by email.`,
  };
}

export default async function DevotionalSubscriptionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const series = await getPublishedDevotionalSeriesBySlug(slug);

  if (!series) notFound();
  // There is no Español subscription yet, so an Español series sends visitors to its own page.
  if (series.language === "es") redirect(`/devotionals/${series.slug}`);
  redirect(getDevotionalStartPath(series));
}
