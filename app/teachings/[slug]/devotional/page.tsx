import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { notFound } from "next/navigation";
import { PublicFooter } from "@/app/public-footer";
import { PublicHeader } from "@/app/public-header";
import { ReturnToTop } from "@/app/return-to-top";
import { DEVOTIONAL_DAY_NUMBERS, splitParagraphs, type DevotionalDay } from "@/lib/devotionals";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: teaching } = await supabase
    .from("teachings")
    .select("id, slug, title")
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();

  if (!teaching) return { title: "Teaching | The Whiteboard", robots: { index: false, follow: false } };

  const { data: devotional } = await supabase
    .from("teaching_devotionals")
    .select("title, introduction")
    .eq("teaching_id", teaching.id)
    .eq("status", "published")
    .maybeSingle();

  if (!devotional) return { title: "Teaching | The Whiteboard", robots: { index: false, follow: false } };

  return {
    title: `${devotional.title} | 7-Day Devotional`,
    description: splitParagraphs(devotional.introduction)[0] ?? `A 7-Day Devotional for ${teaching.title}.`,
  };
}

export default async function DevotionalOverviewPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: teaching, error: teachingError } = await supabase
    .from("teachings")
    .select("id, slug, title")
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();

  if (teachingError || !teaching || teaching.slug !== slug) notFound();

  const { data: devotional, error: devotionalError } = await supabase
    .from("teaching_devotionals")
    .select("id, title, introduction, status")
    .eq("teaching_id", teaching.id)
    .eq("status", "published")
    .maybeSingle();

  if (devotionalError || !devotional) notFound();

  const { data: days, error: daysError } = await supabase
    .from("teaching_devotional_days")
    .select("id, day_number, title, anchor_scriptures")
    .eq("devotional_id", devotional.id)
    .order("day_number", { ascending: true });

  if (daysError) notFound();

  return (
    <main className="min-h-screen bg-[#f7f2e8] text-[#243126]">
      <PublicHeader maxWidthClassName="max-w-4xl" />
      <article className="mx-auto max-w-4xl px-5 py-10 sm:px-8 sm:py-16">
        <header className="border-b border-[#284a3b]/15 pb-8">
          <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#946332]">7-Day Devotional</p>
          <h1 className="mt-3 text-4xl font-extrabold leading-tight tracking-tight text-[#243d31] sm:text-6xl">{devotional.title}</h1>
          <p className="mt-4 text-sm font-bold text-[#607066]">For {teaching.title}</p>
          <TextBlock text={devotional.introduction} className="mt-6 text-lg leading-8 text-[#52645a]" />
        </header>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {DEVOTIONAL_DAY_NUMBERS.map((dayNumber) => {
            const day = (days ?? []).find((item) => item.day_number === dayNumber) as Pick<DevotionalDay, "day_number" | "title" | "anchor_scriptures"> | undefined;
            return (
              <Link key={dayNumber} href={`/teachings/${slug}/devotional/day/${dayNumber}`} className="group rounded-2xl border border-[#284a3b]/10 bg-[#fffdf8] p-5 shadow-sm shadow-[#4d5f52]/5 transition hover:-translate-y-0.5 hover:border-[#a85e32]/35">
                <span className="grid size-10 place-items-center rounded-full bg-[#244a3a] text-sm font-black text-[#f1c66f]">{dayNumber}</span>
                <h2 className="mt-4 text-xl font-extrabold text-[#243d31]">{day?.title || `Day ${dayNumber}`}</h2>
                {day?.anchor_scriptures?.length ? <p className="mt-3 text-sm font-bold text-[#607066]">{day.anchor_scriptures.join(", ")}</p> : null}
                <span className="mt-5 inline-flex items-center gap-2 text-sm font-extrabold text-[#9d5a2f]">Read Day {dayNumber} <ArrowRight aria-hidden="true" size={16} className="transition group-hover:translate-x-1" /></span>
              </Link>
            );
          })}
        </div>
        <Link href={`/teachings/${slug}`} className="mt-10 inline-flex items-center gap-2 font-extrabold text-[#244a3a]">Return to full teaching <ArrowRight aria-hidden="true" size={18} /></Link>
      </article>
      <PublicFooter />
      <ReturnToTop />
    </main>
  );
}

function TextBlock({ text, className }: { text?: string | null; className?: string }) {
  const paragraphs = splitParagraphs(text);
  if (!paragraphs.length) return null;
  return <div className={`space-y-4 ${className ?? ""}`}>{paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</div>;
}
