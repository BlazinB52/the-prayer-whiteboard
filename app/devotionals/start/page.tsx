import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DevotionalSubscriptionPageView } from "@/app/devotionals/subscription-page-view";
import { getDevotionalSenderFormId } from "@/lib/devotional-sender-forms";
import { getDevotionalSignupCopy, getPublishedDevotionalSeries } from "@/lib/public-devotionals";

export const metadata: Metadata = {
  title: "Start a 7-Day Devotional | The Whiteboard",
  description:
    "Subscribe to receive Prayer Whiteboard 7-day devotional series by email.",
};

export default async function DevotionalSubscriptionPage() {
  const [series] = await getPublishedDevotionalSeries();
  if (!series) notFound();
  const senderFormId = getDevotionalSenderFormId(series.slug);
  if (!senderFormId) notFound();

  return (
    <DevotionalSubscriptionPageView
      backHref="/devotionals"
      senderFormId={senderFormId}
      subscriptionCopy={getDevotionalSignupCopy(series)}
    />
  );
}
