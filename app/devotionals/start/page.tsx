import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getDevotionalStartPath, getPublishedDevotionalSeries } from "@/lib/public-devotionals";

export const metadata: Metadata = {
  title: "Start a 7-Day Devotional | The Whiteboard",
  description:
    "Subscribe to receive Prayer Whiteboard 7-day devotional series by email.",
};

export default async function DevotionalSubscriptionPage() {
  const [series] = await getPublishedDevotionalSeries();
  if (!series) notFound();
  redirect(getDevotionalStartPath(series));
}
