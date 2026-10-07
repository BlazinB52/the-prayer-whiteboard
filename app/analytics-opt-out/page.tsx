import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/alternates";
import { AnalyticsOptOutControls } from "./analytics-opt-out-controls";
import { PublicFooter } from "../public-footer";
import { PublicHeader } from "../public-header";

export const metadata: Metadata = buildPageMetadata({ title: "Analytics Opt-Out", path: "/analytics-opt-out", noindex: true });

export default function AnalyticsOptOutPage() {
  return (
    <main className="min-h-screen bg-[#f7f2e8] text-[#243126]">
      <PublicHeader />
      <div className="mx-auto max-w-3xl px-5 py-12 sm:px-8 sm:py-16">
        <AnalyticsOptOutControls />
      </div>
      <PublicFooter />
    </main>
  );
}
