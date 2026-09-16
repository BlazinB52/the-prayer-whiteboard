import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CalendarDays, Layers } from "lucide-react";
import { PublicFooter } from "@/app/public-footer";
import { PublicHeader } from "@/app/public-header";
import { ReturnToTop } from "@/app/return-to-top";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Deep Dives | The Whiteboard",
  description: "Deeper Prayer Whiteboard teachings for mature study in God's Word.",
};

type DeepDiveTeaching = {
  id: string;
  slug: string;
  title: string;
  gathering_date: string | null;
  summary: string | null;
  central_theme: string | null;
  published_at: string | null;
};

const deepDiveNav = [
  { href: "/", label: "Home" },
  { href: "/#latest", label: "Latest Teaching" },
  { href: "/devotionals", label: "Devotionals" },
  { href: "/points-of-agreement", label: "Prayer Guide" },
  { href: "/subscribe", label: "Email Updates" },
];

export default async function DeepDivesPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("teachings")
    .select("id, slug, title, gathering_date, summary, central_theme, published_at")
    .eq("status", "published")
    .eq("teaching_type", "deep_dive")
    .order("gathering_date", { ascending: false, nullsFirst: false })
    .order("published_at", { ascending: false, nullsFirst: false })
    .order("title", { ascending: true });

  const deepDives = error ? [] : (data ?? []) as DeepDiveTeaching[];

  return (
    <main className="min-h-screen bg-[#f4efe4] text-[#20382e]">
      <PublicHeader maxWidthClassName="max-w-6xl" nav={deepDiveNav} />
      <section className="bg-[#20382e] px-5 py-12 text-[#f8f1df] sm:px-8 sm:py-16">
        <div className="mx-auto max-w-6xl">
          <span className="grid size-12 place-items-center rounded-2xl bg-[#f0cb83] text-[#20382e]"><Layers aria-hidden="true" size={25} /></span>
          <p className="mt-6 text-xs font-extrabold uppercase tracking-[0.2em] text-[#f0cb83]">Deep Dives</p>
          <h1 className="mt-3 max-w-3xl text-5xl font-extrabold leading-tight tracking-tight text-white sm:text-6xl">Launch Out Into the Deep</h1>
          <blockquote className="mt-8 max-w-2xl border-l-4 border-[#f0cb83] pl-5 text-xl font-bold leading-8 text-white">
            <p>&ldquo;Launch out into the deep.&rdquo;</p>
            <cite className="mt-3 block text-xs not-italic font-extrabold uppercase tracking-[0.18em] text-[#f0cb83]">Luke 5:4</cite>
          </blockquote>
          <p className="mt-7 max-w-3xl text-lg leading-8 text-[#dce8e1]">Go beyond the shorelines of our weekly gatherings. These deeper teachings are built specifically for those who are hungry for more&mdash;designed to mature your faith, expand your vision, and anchor your understanding in the depths of God&apos;s Word.</p>
        </div>
      </section>

      <section className="px-5 py-12 sm:px-8 sm:py-16">
        <div className="mx-auto max-w-6xl">
          {deepDives.length ? (
            <div className="grid gap-5 md:grid-cols-2">
              {deepDives.map((teaching) => <DeepDiveCard key={teaching.id} teaching={teaching} />)}
            </div>
          ) : (
            <ComingSoonDeepDive />
          )}
        </div>
      </section>
      <PublicFooter />
      <ReturnToTop />
    </main>
  );
}

function DeepDiveCard({ teaching }: { teaching: DeepDiveTeaching }) {
  const description = teaching.central_theme || teaching.summary || "A deeper teaching from The Prayer Whiteboard.";
  return (
    <article className="group flex min-h-[320px] flex-col rounded-2xl border border-[#20382e]/15 bg-[#fffdf8] p-6 shadow-xl shadow-[#20382e]/10 transition hover:-translate-y-0.5 hover:border-[#9d5a2f]/40 sm:p-7">
      <div className="flex items-center justify-between gap-4">
        <span className="rounded-full bg-[#20382e] px-3 py-1 text-[10px] font-black uppercase tracking-wider text-[#f0cb83]">Deep Dive</span>
        {teaching.gathering_date ? <span className="inline-flex items-center gap-2 text-xs font-bold text-[#607066]"><CalendarDays aria-hidden="true" size={15} /> {formatDate(teaching.gathering_date)}</span> : null}
      </div>
      <h2 className="mt-5 text-3xl font-extrabold leading-tight tracking-tight text-[#20382e]">{teaching.title}</h2>
      <p className="mt-4 leading-7 text-[#52645a]">{description}</p>
      {teaching.summary && teaching.central_theme ? <p className="mt-3 text-sm leading-6 text-[#607066]">{teaching.summary}</p> : null}
      <Link href={`/teachings/${teaching.slug}`} className="mt-auto inline-flex items-center gap-2 pt-6 font-extrabold text-[#9d5a2f] underline-offset-4 transition hover:text-[#a85e32] hover:underline">
        Open Deep Dive <ArrowRight aria-hidden="true" size={18} className="transition group-hover:translate-x-1" />
      </Link>
    </article>
  );
}

function ComingSoonDeepDive() {
  return (
    <article className="grid gap-6 rounded-2xl border border-[#20382e]/15 bg-[#fffdf8] p-6 shadow-xl shadow-[#20382e]/10 sm:p-8 lg:grid-cols-[0.72fr_1.28fr] lg:items-center">
      <div className="rounded-2xl border border-[#f0cb83]/35 bg-[#20382e] p-6 text-[#f8f1df]">
        <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-[#f0cb83]">Coming Soon</p>
        <h2 className="mt-4 text-3xl font-extrabold leading-tight text-white">Our First Deep Dive</h2>
        <div className="mt-6 h-2 w-28 rounded-full bg-[#f0cb83]" />
      </div>
      <div>
        <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#946332]">A deeper study is being prepared</p>
        <p className="mt-4 text-lg leading-8 text-[#52645a]">A deeper study is being prepared for The Prayer Whiteboard.</p>
        <p className="mt-4 leading-7 text-[#607066]">This upcoming series will go beyond the shoreline of the weekly gathering and spend more time developing the Word, following its connections, and drawing out the truths that deserve a deeper look.</p>
      </div>
    </article>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}
