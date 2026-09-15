import type { Metadata } from "next";
import Link from "next/link";
import { PublicFooter } from "@/app/public-footer";
import { PublicHeader } from "@/app/public-header";
import { PreferenceRequestForm } from "./preference-request-form";

export const metadata: Metadata = {
  title: "Email Preferences | The Prayer Whiteboard",
  robots: { index: false, follow: false },
};

export default function EmailPreferencesPage() {
  return (
    <main className="min-h-screen bg-[#f7f2e8] text-[#243126]">
      <PublicHeader maxWidthClassName="max-w-4xl" end={<Link href="/" className="shrink-0 text-sm font-extrabold text-[#244a3a]">Home</Link>} />
      <section className="mx-auto max-w-4xl px-5 py-10 sm:px-8 sm:py-16">
        <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#946332]">Email Preferences</p>
        <h1 className="mt-3 text-4xl font-extrabold tracking-tight text-[#243d31] sm:text-6xl">Manage Your Email Updates</h1>
        <p className="mt-5 max-w-2xl text-base leading-7 text-[#52645a]">Enter your email address and we will send a short-lived secure link to manage your preferences.</p>
        <div className="mt-8"><PreferenceRequestForm /></div>
      </section>
      <PublicFooter />
    </main>
  );
}
