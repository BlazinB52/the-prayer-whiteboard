import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DevotionalSubscriptionPageView } from "@/app/devotionals/subscription-page-view";
import {
  getDevotionalPath,
  getDevotionalSignupCopy,
  getPublishedDevotionalSeriesBySlug,
} from "@/lib/public-devotionals";
import { getDevotionalSenderFormId } from "@/lib/devotional-sender-forms";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const series = await getPublishedDevotionalSeriesBySlug(slug);

  if (!series) return { title: "Start a Devotional | The Whiteboard", robots: { index: false, follow: false } };

  return {
    title: `Start ${series.title} | The Whiteboard`,
    description: `Subscribe to receive ${series.title} by email.`,
  };
}

export default async function DevotionalSubscriptionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const series = await getPublishedDevotionalSeriesBySlug(slug);

  if (!series) notFound();
  const senderFormId = getDevotionalSenderFormId(series.slug);
  if (!senderFormId) notFound();

  return (
    <DevotionalSubscriptionPageView
      backHref={getDevotionalPath(series)}
      backLabel="Devotional"
      senderFormId={senderFormId}
      subscriptionCopy={getDevotionalSignupCopy(series)}
    />
  );
}
