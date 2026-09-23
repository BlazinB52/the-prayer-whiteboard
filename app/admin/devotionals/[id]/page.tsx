import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DevotionalDayForms, DevotionalImportForm, DevotionalPreviewLink, DevotionalSeriesForm } from "@/app/admin/teachings/[id]/devotional/devotional-editor";
import { importStandaloneDevotionalText, publishStandaloneDevotional, unpublishStandaloneDevotional, updateStandaloneDevotionalDay, updateStandaloneDevotionalSeries } from "@/app/admin/teachings/devotional-actions";
import { PublishDevotionalButton, UnpublishDevotionalButton } from "@/app/admin/teachings/devotional-buttons";
import { DEVOTIONAL_DAY_NUMBERS, type DevotionalDay, type TeachingDevotional } from "@/lib/devotionals";
import { requireAdmin } from "@/lib/supabase/admin";

export const metadata: Metadata = {
  title: "Manage Devotional",
  robots: { index: false, follow: false },
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function AdminStandaloneDevotionalPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string; imported?: string; published?: string; unpublished?: string }> }) {
  const [{ id }, messages] = await Promise.all([params, searchParams]);
  if (!UUID_PATTERN.test(id)) notFound();

  const { supabase } = await requireAdmin();
  const { data: devotional, error: devotionalError } = await supabase
    .from("teaching_devotionals")
    .select("id, teaching_id, slug, title, introduction, status, published_at")
    .eq("id", id)
    .maybeSingle();

  if (devotionalError || !devotional) notFound();

  // A devotional can be assigned to more than one teaching, so read every
  // assignment rather than assuming a single owner.
  const { data: assignments } = await supabase
    .from("teaching_devotional_assignments")
    .select("teaching_id")
    .eq("devotional_id", devotional.id);

  const teachingIds = [...new Set((assignments ?? []).map((assignment) => assignment.teaching_id))];
  const { data: teachings } = teachingIds.length
    ? await supabase.from("teachings").select("id, title").in("id", teachingIds)
    : { data: [] };

  const { data: days } = await supabase
    .from("teaching_devotional_days")
    .select("id, devotional_id, day_number, title, anchor_scriptures, devotional_reading, confession, journal_prompt, prayer_activation")
    .eq("devotional_id", devotional.id)
    .order("day_number", { ascending: true });

  const assignedTeachings = teachings ?? [];
  const dayActions = Object.fromEntries(
    DEVOTIONAL_DAY_NUMBERS.map((dayNumber) => [dayNumber, updateStandaloneDevotionalDay.bind(null, devotional.id, dayNumber)]),
  ) as Record<number, Parameters<typeof DevotionalDayForms>[0]["actions"][number]>;

  return (
    <main className="admin-shell">
      <div className="mx-auto max-w-4xl">
        <Link href="/admin/devotionals" className="text-sm font-extrabold text-[#946332] hover:text-[#a85e32]">Back to devotionals</Link>
        <header className="mt-4 border-b border-[#284a3b]/10 pb-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#946332]">Manage 7-Day Devotional</p>
              <h1 className="mt-3 text-4xl font-extrabold tracking-tight text-[#243d31]">{devotional.title}</h1>
            </div>
            <span className="rounded-full bg-[#e7efe9] px-3 py-1 text-[10px] font-black uppercase tracking-wider text-[#326048]">{devotional.status}</span>
          </div>
        </header>

        {messages.created === "1" ? <p role="status" className="mt-6 rounded-xl border border-[#326048]/20 bg-[#e7efe9] px-4 py-3 text-sm font-bold text-[#326048]">Devotional created as a draft. Write the seven days below, or import them from a text file.</p> : null}
        {messages.imported === "1" ? <p role="status" className="mt-6 rounded-xl border border-[#326048]/20 bg-[#e7efe9] px-4 py-3 text-sm font-bold text-[#326048]">Devotional text imported as a draft.</p> : null}
        {messages.published === "1" ? <p role="status" className="mt-6 rounded-xl border border-[#326048]/20 bg-[#e7efe9] px-4 py-3 text-sm font-bold text-[#326048]">Devotional published.</p> : null}
        {messages.unpublished === "1" ? <p role="status" className="mt-6 rounded-xl border border-[#326048]/20 bg-[#e7efe9] px-4 py-3 text-sm font-bold text-[#326048]">Devotional unpublished and returned to draft.</p> : null}

        <section className="mt-8 rounded-2xl border border-[#284a3b]/10 bg-[#fffdf8] p-6">
          <h2 className="text-2xl font-extrabold text-[#243d31]">Teaching Association</h2>
          {assignedTeachings.length ? (
            <>
              <p className="mt-3 text-sm leading-6 text-[#607066]">This devotional is used by the teachings below. Publishing is handled from a teaching&apos;s devotional page.</p>
              <ul className="mt-4 grid gap-2">
                {assignedTeachings.map((teaching) => (
                  <li key={teaching.id}>
                    <Link href={`/admin/teachings/${teaching.id}/devotional`} className="font-extrabold text-[#9d5a2f] hover:text-[#a85e32]">{teaching.title}</Link>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="mt-3 text-sm leading-6 text-[#607066]">
              This devotional is not attached to any teaching. It can still be published and read on its own. To tie it to
              a teaching, open one under <Link href="/admin/teachings" className="font-extrabold text-[#9d5a2f] hover:text-[#a85e32]">Teachings</Link>, go to
              its devotional page, and choose this devotional under &quot;Use Existing Devotional&quot;.
            </p>
          )}
        </section>

        <section className="mt-8 rounded-2xl border border-[#284a3b]/10 bg-[#fffdf8] p-6">
          <h2 className="text-2xl font-extrabold text-[#243d31]">Import From Text File</h2>
          <p className="mt-3 text-sm leading-6 text-[#607066]">Upload a prepared devotional text file to create or replace this draft devotional&apos;s content.</p>
          <DevotionalImportForm action={importStandaloneDevotionalText.bind(null, devotional.id)} hasPublishedDevotional={devotional.status === "published"} />
        </section>

        <section className="mt-8 rounded-2xl border border-[#284a3b]/10 bg-[#fffdf8] p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-extrabold text-[#243d31]">Series Information</h2>
              <p className="mt-2 text-sm text-[#607066]">Current status: <span className="font-extrabold text-[#385245]">{devotional.status}</span></p>
            </div>
            <DevotionalPreviewLink href={`/admin/devotionals/${devotional.id}/preview`} />
          </div>
          <DevotionalSeriesForm devotional={devotional as TeachingDevotional} action={updateStandaloneDevotionalSeries.bind(null, devotional.id)} />
          <div className="mt-6 flex flex-col gap-3 border-t border-[#284a3b]/10 pt-5 sm:flex-row">
            {devotional.status === "published"
              ? <UnpublishDevotionalButton action={unpublishStandaloneDevotional.bind(null, devotional.id)} />
              : <PublishDevotionalButton action={publishStandaloneDevotional.bind(null, devotional.id)} />}
          </div>
          <p className="mt-4 text-sm leading-6 text-[#607066]">
            {devotional.status === "published"
              ? <>This devotional is public on its own at <Link href={`/devotionals/${devotional.slug}`} className="font-extrabold text-[#9d5a2f] hover:text-[#a85e32]">/devotionals/{devotional.slug}</Link>, whether or not a teaching is attached.</>
              : "Publishing makes this devotional public on its own. A teaching is optional."}
          </p>
        </section>

        <section className="mt-8">
          <h2 className="text-2xl font-extrabold text-[#243d31]">Seven Devotional Days</h2>
          <DevotionalDayForms days={(days ?? []) as DevotionalDay[]} actions={dayActions} />
        </section>
      </div>
    </main>
  );
}
