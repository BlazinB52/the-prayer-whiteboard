import type { Metadata } from "next";
import Link from "next/link";
import { PublicFooter } from "@/app/public-footer";
import { PublicHeader } from "@/app/public-header";
import { confirmSubscriptionToken } from "@/lib/email-subscriptions";

export const metadata: Metadata = {
  title: "Confirm Subscription | The Prayer Whiteboard",
  robots: { index: false, follow: false },
};

export default async function ConfirmSubscriptionPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  const result = await confirmSubscriptionToken(token);
  const copy = getCopy(result.status);

  return (
    <main className="min-h-screen bg-[#f7f2e8] text-[#243126]">
      <PublicHeader maxWidthClassName="max-w-4xl" end={<Link href="/" className="shrink-0 text-sm font-extrabold text-[#244a3a]">Home</Link>} />
      <section className="mx-auto max-w-4xl px-5 py-14 sm:px-8 sm:py-20">
        <article className="rounded-2xl border border-[#284a3b]/10 bg-[#fffdf8] p-6 shadow-xl shadow-[#4d5f52]/8 sm:p-8">
          <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#946332]">Email Updates</p>
          <h1 className="mt-3 text-4xl font-extrabold tracking-tight text-[#243d31]">{copy.title}</h1>
          <p className="mt-4 max-w-2xl leading-7 text-[#52645a]">{copy.body}</p>
          <Link href={copy.href} className="mt-6 inline-flex min-h-12 items-center justify-center rounded-2xl bg-[#244a3a] px-5 font-extrabold text-white shadow-xl shadow-[#244a3a]/20">
            {copy.link}
          </Link>
        </article>
      </section>
      <PublicFooter />
    </main>
  );
}

function getCopy(status: Awaited<ReturnType<typeof confirmSubscriptionToken>>["status"]) {
  if (status === "confirmed" || status === "already_confirmed") return { title: "Subscription confirmed.", body: "Your Prayer Whiteboard email preferences are active.", href: "/email-preferences", link: "Manage preferences" };
  if (status === "expired") return { title: "This confirmation link expired.", body: "For security, confirmation links expire after 72 hours. Please subscribe again to receive a new confirmation email.", href: "/subscribe", link: "Request a new link" };
  return { title: "This confirmation link is invalid.", body: "Please request a fresh subscription link if you still want to receive Prayer Whiteboard emails.", href: "/subscribe", link: "Subscribe" };
}
