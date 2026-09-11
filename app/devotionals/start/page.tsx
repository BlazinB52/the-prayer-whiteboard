import type { Metadata } from "next";
import { DevotionalSubscriptionPageView } from "@/app/devotionals/subscription-page-view";
import { getDevotionalSignupCopy } from "@/lib/public-devotionals";

export const metadata: Metadata = {
  title: "Start a 7-Day Devotional | The Whiteboard",
  description:
    "Subscribe to receive Prayer Whiteboard 7-day devotional series by email.",
};

export default function DevotionalSubscriptionPage() {
  return (
    <DevotionalSubscriptionPageView
      backHref="/devotionals"
      subscriptionCopy={getDevotionalSignupCopy()}
    />
  );
}
