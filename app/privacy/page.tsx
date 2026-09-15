import type { Metadata } from "next";
import Link from "next/link";
import { PublicFooter } from "@/app/public-footer";
import { PublicHeader } from "@/app/public-header";

export const metadata: Metadata = {
  title: "Privacy Policy | The Prayer Whiteboard",
  description: "How The Prayer Whiteboard handles email subscription information.",
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[#f7f2e8] text-[#243126]">
      <PublicHeader maxWidthClassName="max-w-4xl" end={<Link href="/" className="shrink-0 text-sm font-extrabold text-[#244a3a]">Home</Link>} />
      <article className="mx-auto max-w-4xl px-5 py-10 leading-7 text-[#52645a] sm:px-8 sm:py-16">
        <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#946332]">Privacy</p>
        <h1 className="mt-3 text-4xl font-extrabold tracking-tight text-[#243d31] sm:text-6xl">Privacy Policy</h1>
        <p className="mt-6">The Prayer Whiteboard uses the information you provide to send the email updates you choose and to manage your subscription preferences.</p>
        <h2 className="mt-8 text-2xl font-extrabold text-[#243d31]">Information We Collect</h2>
        <p className="mt-3">Email subscription forms collect your first name, email address, selected email categories, consent status, and preference history. Security tokens are stored only as hashes.</p>
        <h2 className="mt-8 text-2xl font-extrabold text-[#243d31]">How We Use It</h2>
        <p className="mt-3">We use subscription information to send confirmation links, preference-management links, Weekly Updates, new teachings, and devotional emails you have chosen to receive.</p>
        <h2 className="mt-8 text-2xl font-extrabold text-[#243d31]">Your Choices</h2>
        <p className="mt-3">You can change categories or unsubscribe from all Prayer Whiteboard emails through a secure one-time preference link. Request one from the <Link href="/email-preferences" className="font-bold text-[#9d5a2f] underline underline-offset-2">Email Preferences</Link> page.</p>
        <h2 className="mt-8 text-2xl font-extrabold text-[#243d31]">Data Protection</h2>
        <p className="mt-3">Subscriber records are not publicly listed. Administrative access is restricted to authorized administrators, and public visitors cannot browse subscriber or consent-history data.</p>
        <h2 className="mt-8 text-2xl font-extrabold text-[#243d31]">Contact</h2>
        <p className="mt-3">Questions about this policy may be sent to <a href="mailto:theprayerwhiteboard@gmail.com" className="font-bold text-[#9d5a2f] underline underline-offset-2">theprayerwhiteboard@gmail.com</a>.</p>
      </article>
      <PublicFooter />
    </main>
  );
}
