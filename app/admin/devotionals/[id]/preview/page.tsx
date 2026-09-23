import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DevotionalTextBlock } from "@/app/devotional-text-block";
import { DEVOTIONAL_DAY_NUMBERS, type DevotionalDay } from "@/lib/devotionals";
import { requireAdmin } from "@/lib/supabase/admin";

export const metadata: Metadata = {
  title: "Devotional Preview",
  robots: { index: false, follow: false },
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function AdminStandaloneDevotionalPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) notFound();

  const { supabase } = await requireAdmin();
  const { data: devotional } = await supabase
    .from("teaching_devotionals")
    .select("id, slug, title, introduction, status")
    .eq("id", id)
    .maybeSingle();
  if (!devotional) notFound();

  const { data: days } = await supabase
    .from("teaching_devotional_days")
    .select("id, devotional_id, day_number, title, anchor_scriptures, devotional_reading, confession, journal_prompt, prayer_activation")
    .eq("devotional_id", devotional.id)
    .order("day_number", { ascending: true });

  return (
    <main className="min-h-screen bg-[#f7f2e8] text-[#243126]">
      <header className="border-b border-[#284a3b]/10 bg-[#fffdf8]">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <Link href={`/admin/devotionals/${devotional.id}`} className="font-extrabold text-[#946332]">Back to devotional editor</Link>
          <span className="rounded-full bg-[#fff3ed] px-3 py-1 text-[10px] font-black uppercase tracking-wider text-[#a2472c]">Admin Preview</span>
        </div>
      </header>
      <article className="mx-auto max-w-4xl px-5 py-10 sm:px-8 sm:py-16">
        <header className="border-b border-[#284a3b]/15 pb-8">
          <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#946332]">7-Day Devotional</p>
          <h1 className="mt-3 text-4xl font-extrabold leading-tight text-[#243d31] sm:text-6xl">{devotional.title}</h1>
          <p className="mt-4 text-sm font-bold text-[#607066]">Teaching: Not attached to a teaching</p>
          <p className="mt-2 text-sm font-bold text-[#607066]">Saved status: {devotional.status}</p>
          <DevotionalTextBlock text={devotional.introduction} className="mt-6 text-lg leading-8 text-[#52645a]" emptyText="Not saved." />
        </header>
        <div className="mt-10 space-y-8">
          {DEVOTIONAL_DAY_NUMBERS.map((dayNumber) => (
            <DevotionalDayPreview key={dayNumber} dayNumber={dayNumber} day={(days ?? []).find((day) => day.day_number === dayNumber) as DevotionalDay | undefined} />
          ))}
        </div>
      </article>
    </main>
  );
}

function DevotionalDayPreview({ dayNumber, day }: { dayNumber: number; day?: DevotionalDay }) {
  return (
    <section className="rounded-2xl border border-[#284a3b]/10 bg-[#fffdf8] p-6">
      <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#946332]">Day {dayNumber}</p>
      <h2 className="mt-2 text-2xl font-extrabold text-[#243d31]">{day?.title || "Untitled day"}</h2>
      <Field title="Anchor Scriptures">{day?.anchor_scriptures?.length ? <ul className="list-disc space-y-1 pl-5">{day.anchor_scriptures.map((scripture) => <li key={scripture}>{scripture}</li>)}</ul> : <p>Not saved.</p>}</Field>
      <Field title="Devotional Reading"><DevotionalTextBlock text={day?.devotional_reading} emptyText="Not saved." /></Field>
      <Field title="Today's Confession"><DevotionalTextBlock text={day?.confession} emptyText="Not saved." /></Field>
      <Field title="5-Minute Journal Prompt"><DevotionalTextBlock text={day?.journal_prompt} emptyText="Not saved." /></Field>
      <Field title="Prayer Activation Exercise"><DevotionalTextBlock text={day?.prayer_activation} emptyText="Not saved." /></Field>
    </section>
  );
}

function Field({ title, children }: { title: string; children: ReactNode }) {
  return <div className="mt-5"><h3 className="text-sm font-extrabold text-[#385245]">{title}</h3><div className="mt-2 leading-7 text-[#52645a]">{children}</div></div>;
}
