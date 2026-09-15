import type { Metadata } from "next";
import Link from "next/link";
import { PublicFooter } from "@/app/public-footer";
import { PublicHeader } from "@/app/public-header";
import { loadPreferenceToken } from "@/lib/email-subscriptions";
import { PreferenceManagementForm } from "./preference-management-form";

export const metadata: Metadata = {
  title: "Manage Email Preferences | The Prayer Whiteboard",
  robots: { index: false, follow: false },
};

export default async function ManageEmailPreferencesPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  const preference = await loadPreferenceToken(token);

  return (
    <main className="min-h-screen bg-[#f7f2e8] text-[#243126]">
      <PublicHeader maxWidthClassName="max-w-4xl" end={<Link href="/" className="shrink-0 text-sm font-extrabold text-[#244a3a]">Home</Link>} />
      <section className="mx-auto max-w-4xl px-5 py-10 sm:px-8 sm:py-16">
        <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#946332]">Email Preferences</p>
        <h1 className="mt-3 text-4xl font-extrabold tracking-tight text-[#243d31] sm:text-6xl">Your Email Updates</h1>
        <div className="mt-8">
          {preference ? (
            <PreferenceManagementForm preference={preference} />
          ) : (
            <div className="rounded-2xl border border-[#284a3b]/10 bg-[#fffdf8] p-6 shadow-xl shadow-[#4d5f52]/8">
              <p className="font-bold leading-7 text-[#52645a]">This preference link is invalid or expired.</p>
              <Link href="/email-preferences" className="mt-5 inline-flex min-h-12 items-center justify-center rounded-2xl bg-[#244a3a] px-5 font-extrabold text-white shadow-xl shadow-[#244a3a]/20">Request a new link</Link>
            </div>
          )}
        </div>
      </section>
      <PublicFooter />
    </main>
  );
}
