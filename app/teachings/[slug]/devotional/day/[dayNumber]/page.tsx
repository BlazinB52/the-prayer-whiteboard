import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, BookOpenText } from "lucide-react";
import { notFound } from "next/navigation";
import { splitParagraphs, type DevotionalDay } from "@/lib/devotionals";
import { createClient } from "@/lib/supabase/server";

function parseDayNumber(value: string) {
  const dayNumber = Number(value);
  return Number.isInteger(dayNumber) && dayNumber >= 1 && dayNumber <= 7 ? dayNumber : null;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string; dayNumber: string }> }): Promise<Metadata> {
  const { slug, dayNumber: dayNumberParam } = await params;
  const dayNumber = parseDayNumber(dayNumberParam);
  if (!dayNumber) return { title: "Teaching | The Whiteboard", robots: { index: false, follow: false } };

  const supabase = await createClient();
  const { data: teaching } = await supabase
    .from("teachings")
    .select("id, title")
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();

  if (!teaching) return { title: "Teaching | The Whiteboard", robots: { index: false, follow: false } };

  const { data: devotional } = await supabase
    .from("teaching_devotionals")
    .select("id, title")
    .eq("teaching_id", teaching.id)
    .eq("status", "published")
    .maybeSingle();

  if (!devotional) return { title: "Teaching | The Whiteboard", robots: { index: false, follow: false } };

  const { data: day } = await supabase
    .from("teaching_devotional_days")
    .select("title")
    .eq("devotional_id", devotional.id)
    .eq("day_number", dayNumber)
    .maybeSingle();

  if (!day) return { title: "Teaching | The Whiteboard", robots: { index: false, follow: false } };
  return { title: `Day ${dayNumber}: ${day.title} | ${devotional.title}` };
}

export default async function DevotionalDayPage({ params }: { params: Promise<{ slug: string; dayNumber: string }> }) {
  const { slug, dayNumber: dayNumberParam } = await params;
  const dayNumber = parseDayNumber(dayNumberParam);
  if (!dayNumber) notFound();

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
    .select("id, title")
    .eq("teaching_id", teaching.id)
    .eq("status", "published")
    .maybeSingle();

  if (devotionalError || !devotional) notFound();

  const { data: day, error: dayError } = await supabase
    .from("teaching_devotional_days")
    .select("id, devotional_id, day_number, title, anchor_scriptures, devotional_reading, confession, journal_prompt, prayer_activation")
    .eq("devotional_id", devotional.id)
    .eq("day_number", dayNumber)
    .maybeSingle();

  if (dayError || !day) notFound();

  return (
    <main className="min-h-screen bg-[#f7f2e8] text-[#243126]">
      <header className="border-b border-[#284a3b]/10 bg-[#fffdf8]">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <Link href="/" className="flex items-center gap-2 font-extrabold text-[#21382e]"><BookOpenText aria-hidden="true" size={20} /> The Whiteboard</Link>
          <Link href={`/teachings/${slug}/devotional`} className="text-sm font-extrabold text-[#244a3a]">Devotional overview</Link>
        </div>
      </header>
      <article className="mx-auto max-w-3xl px-5 py-10 sm:px-8 sm:py-16">
        <header className="border-b border-[#284a3b]/15 pb-8">
          <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#946332]">Day {dayNumber} of 7</p>
          <h1 className="mt-3 text-4xl font-extrabold leading-tight tracking-tight text-[#243d31] sm:text-5xl">{day.title}</h1>
          <p className="mt-4 text-sm font-bold text-[#607066]">{devotional.title} for {teaching.title}</p>
        </header>
        <div className="mt-8 space-y-8">
          <DevotionalField title="Anchor Scriptures">
            <ul className="list-disc space-y-2 pl-6">{(day as DevotionalDay).anchor_scriptures.map((scripture) => <li key={scripture}>{scripture}</li>)}</ul>
          </DevotionalField>
          <DevotionalField title="Devotional Reading"><TextBlock text={day.devotional_reading} /></DevotionalField>
          <DevotionalField title="Today's Confession"><TextBlock text={day.confession} /></DevotionalField>
          <DevotionalField title="5-Minute Journal Prompt"><TextBlock text={day.journal_prompt} /></DevotionalField>
          <DevotionalField title="Prayer Activation Exercise"><TextBlock text={day.prayer_activation} /></DevotionalField>
        </div>
        <nav className="mt-12 flex flex-col gap-3 border-t border-[#284a3b]/15 pt-6 sm:flex-row sm:items-center sm:justify-between">
          {dayNumber > 1 ? <Link href={`/teachings/${slug}/devotional/day/${dayNumber - 1}`} className="inline-flex items-center gap-2 font-extrabold text-[#9d5a2f]"><ArrowLeft aria-hidden="true" size={18} /> Previous day</Link> : <span />}
          {dayNumber < 7 ? <Link href={`/teachings/${slug}/devotional/day/${dayNumber + 1}`} className="inline-flex items-center gap-2 font-extrabold text-[#9d5a2f]">Next day <ArrowRight aria-hidden="true" size={18} /></Link> : null}
        </nav>
        <div className="mt-6 flex flex-wrap gap-4 text-sm font-extrabold text-[#244a3a]">
          <Link href={`/teachings/${slug}/devotional`}>Return to devotional overview</Link>
          <Link href={`/teachings/${slug}`}>Return to full teaching</Link>
        </div>
      </article>
    </main>
  );
}

function DevotionalField({ title, children }: { title: string; children: ReactNode }) {
  return <section className="rounded-2xl border border-[#284a3b]/10 bg-[#fffdf8] p-6"><h2 className="text-xl font-extrabold text-[#243d31]">{title}</h2><div className="mt-4 text-base leading-8 text-[#52645a]">{children}</div></section>;
}

function TextBlock({ text }: { text?: string | null }) {
  const paragraphs = splitParagraphs(text);
  return <div className="space-y-4">{paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</div>;
}
