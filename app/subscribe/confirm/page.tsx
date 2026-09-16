import type { Metadata } from "next";
import Link from "next/link";
import { PublicFooter } from "@/app/public-footer";
import { PublicHeader } from "@/app/public-header";
import { confirmSubscriptionToken } from "@/lib/email-subscriptions";
import { categoryLabels, confirmationCopy } from "@/lib/subscription-confirmation-view";

export const metadata: Metadata = {
  title: "Confirm Subscription | The Prayer Whiteboard",
  robots: { index: false, follow: false },
};

export default async function ConfirmSubscriptionPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  const result = await confirmSubscriptionToken(token);
  const copy = confirmationCopy(result.status);
  const labels = categoryLabels(result.categories);

  return (
    <main className="min-h-screen bg-[#f7f2e8] text-[#243126]">
      <PublicHeader maxWidthClassName="max-w-4xl" end={<Link href="/" className="shrink-0 text-sm font-extrabold text-[#244a3a]">Home</Link>} />
      <section className="mx-auto max-w-4xl px-5 py-14 sm:px-8 sm:py-20">
        <article className="rounded-2xl border border-[#284a3b]/10 bg-[#fffdf8] p-6 shadow-xl shadow-[#4d5f52]/8 sm:p-8">
          <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#946332]">Email Updates</p>
          <h1 className="mt-3 text-4xl font-extrabold tracking-tight text-[#243d31]">{copy.title}</h1>
          <p className="mt-4 max-w-2xl leading-7 text-[#52645a]">{copy.body}</p>
          {copy.confirmed && labels.length ? (
            <ul className="mt-4 list-disc space-y-2 pl-6 font-bold leading-7 text-[#243126]">
              {labels.map((label) => <li key={label}>{label}</li>)}
            </ul>
          ) : null}
          <Link href={copy.href} className="mt-6 inline-flex min-h-12 items-center justify-center rounded-2xl bg-[#244a3a] px-5 font-extrabold !text-white shadow-xl shadow-[#244a3a]/20 transition hover:bg-[#1d3d30] hover:!text-white focus-visible:!text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#946332] active:bg-[#193329] active:!text-white visited:!text-white">
            {copy.link}
          </Link>
        </article>
      </section>
      <PublicFooter />
    </main>
  );
}
