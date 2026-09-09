import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PublicFooter } from "@/app/public-footer";
import { PublicHeader } from "@/app/public-header";
import { ReturnToTop } from "@/app/return-to-top";

const contactEmail = "theprayerwhiteboard@gmail.com";

export const metadata: Metadata = {
  title: "About The Prayer Whiteboard",
  description: "The Prayer Whiteboard mission artwork and Matthew 18:19.",
};

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-[#f7f2e8] text-[#243126]">
      <PublicHeader maxWidthClassName="max-w-5xl" end={
          <Link href="/" className="inline-flex min-h-11 shrink-0 items-center gap-2 text-sm font-extrabold text-[#244a3a]">
            <ArrowLeft aria-hidden="true" size={17} />
            Return to Home
          </Link>
        } />

      <article className="mx-auto max-w-5xl px-4 py-8 sm:px-8 sm:py-12">
        <header className="mx-auto max-w-[720px] pb-6 text-center">
          <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#946332]">The Prayer Whiteboard</p>
          <h1 className="mt-3 text-3xl font-extrabold leading-tight tracking-tight text-[#243d31] sm:text-5xl">
            About The Prayer Whiteboard
          </h1>
        </header>

        <div className="mx-auto w-full max-w-[720px]">
          <Image
            src="/Images/prayer-whiteboard-mission-web-1080x1440.webp"
            alt="The Prayer Whiteboard mission and Matthew 18:19"
            width={1080}
            height={1440}
            sizes="(max-width: 768px) calc(100vw - 32px), 720px"
            style={{
              width: "100%",
              height: "auto",
            }}
            priority
          />
        </div>

        <section className="mx-auto mt-8 max-w-[720px] border-t border-[#284a3b]/10 pt-8 text-center">
          <h2 className="text-2xl font-extrabold text-[#243d31]">Contact Us</h2>
          <p className="mt-3 leading-7 text-[#52645a]">
            For questions, comments, or more information about The Prayer Whiteboard, email us at:
          </p>
          <a href={`mailto:${contactEmail}`} className="mt-4 inline-flex min-h-11 items-center justify-center rounded-xl border border-[#284a3b]/15 bg-[#fffdf8] px-4 font-extrabold text-[#9d5a2f] transition hover:border-[#a85e32]/40 hover:text-[#a85e32]">
            theprayerwhiteboard@gmail.com
          </a>
        </section>
      </article>
      <PublicFooter />
      <ReturnToTop />
    </main>
  );
}
