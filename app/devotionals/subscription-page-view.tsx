import Link from "next/link";
import { ArrowLeft, Mail } from "lucide-react";
import { PublicFooter } from "@/app/public-footer";
import { PublicHeader } from "@/app/public-header";
import { ReturnToTop } from "@/app/return-to-top";
import { DevotionalSubscriptionForm } from "./start/subscription-form";

export function DevotionalSubscriptionPageView({
  backHref,
  backLabel = "Devotionals",
  subscriptionCopy,
}: {
  backHref: string;
  backLabel?: string;
  subscriptionCopy: string;
}) {
  return (
    <main className="min-h-screen bg-[#f7f2e8] text-[#243126]">
      <PublicHeader maxWidthClassName="max-w-4xl" end={<Link href={backHref} className="inline-flex min-h-11 shrink-0 items-center gap-2 text-sm font-extrabold text-[#244a3a]"><ArrowLeft aria-hidden="true" size={17} />{backLabel}</Link>} />
      <article className="mx-auto max-w-4xl px-5 py-10 sm:px-8 sm:py-16">
        <section className="grid gap-7 rounded-[2rem] border border-[#284a3b]/10 bg-white p-6 shadow-xl shadow-[#4d5f52]/10 sm:p-8 lg:grid-cols-[0.85fr_1.15fr]">
          <div>
            <span className="grid size-12 place-items-center rounded-2xl bg-[#e8efe9] text-[#244a3a]">
              <Mail aria-hidden="true" size={24} />
            </span>
            <p className="mt-6 text-xs font-extrabold uppercase tracking-[0.18em] text-[#946332]">
              7-Day Devotional
            </p>
            <h1 className="mt-3 text-4xl font-extrabold leading-tight tracking-tight text-[#243d31] sm:text-5xl">
              Start the devotional by email.
            </h1>
          </div>
          <div>
            <p className="whitespace-pre-line text-lg leading-8 text-[#52645a]">
              {subscriptionCopy}
            </p>
            <DevotionalSubscriptionForm />
            <p className="mt-5 text-sm leading-6 text-[#607066]">
              We use your email only to send Prayer Whiteboard devotional series you&apos;ve subscribed to. You can unsubscribe at any time.
            </p>
          </div>
        </section>
      </article>
      <PublicFooter />
      <ReturnToTop />
    </main>
  );
}
