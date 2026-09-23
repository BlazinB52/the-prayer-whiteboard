import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DEVOTIONAL_DAY_NUMBERS, type DevotionalDay, type TeachingDevotional } from "@/lib/devotionals";
import { requireAdmin } from "@/lib/supabase/admin";
import { assignExistingDevotional, createDevotional, importDevotionalText, publishDevotional, removeDevotionalAssignment, unpublishDevotional, updateDevotionalDay, updateDevotionalSeries } from "../../devotional-actions";
import { PublishDevotionalButton, UnpublishDevotionalButton } from "../../devotional-buttons";
import { CreateDevotionalForm } from "./create-devotional-form";
import { DevotionalAssignmentForm } from "./devotional-assignment-form";
import { DevotionalDayForms, DevotionalImportForm, DevotionalPreviewLink, DevotionalSeriesForm } from "./devotional-editor";

export const metadata: Metadata = {
  title: "Manage 7-Day Devotional",
  robots: { index: false, follow: false },
};

export default async function AdminDevotionalPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ assigned?: string; removed?: string; created?: string; imported?: string; published?: string; unpublished?: string }> }) {
  const [{ id }, messages] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) notFound();

  const { supabase } = await requireAdmin();
  const { data: teaching, error: teachingError } = await supabase
    .from("teachings")
    .select("id, slug, title, status")
    .eq("id", id)
    .in("status", ["draft", "published"])
    .maybeSingle();

  if (teachingError || !teaching) notFound();

  const [{ data: assignment }, { data: devotionals }] = await Promise.all([
    supabase
    .from("teaching_devotional_assignments")
    .select("devotional_id")
    .eq("teaching_id", teaching.id)
    .maybeSingle(),
    supabase
      .from("teaching_devotionals")
      .select("id, teaching_id, slug, title, introduction, status, published_at")
      .order("title", { ascending: true }),
  ]);
  const devotional = (devotionals ?? []).find((item) => item.id === assignment?.devotional_id) ?? null;

  const { data: days } = devotional
    ? await supabase
      .from("teaching_devotional_days")
      .select("id, devotional_id, day_number, title, anchor_scriptures, devotional_reading, confession, journal_prompt, prayer_activation")
      .eq("devotional_id", devotional.id)
      .order("day_number", { ascending: true })
    : { data: [] };

  const dayActions = Object.fromEntries(
    DEVOTIONAL_DAY_NUMBERS.map((dayNumber) => [dayNumber, updateDevotionalDay.bind(null, teaching.id, dayNumber)]),
  ) as Record<number, Parameters<typeof DevotionalDayForms>[0]["actions"][number]>;

  return (
    <main className="admin-shell">
      <div className="mx-auto max-w-4xl">
        <Link href={`/admin/teachings/${teaching.id}/edit`} className="text-sm font-extrabold text-[#946332] hover:text-[#a85e32]">Back to teaching editor</Link>
        <header className="mt-4 border-b border-[#284a3b]/10 pb-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#946332]">Manage 7-Day Devotional</p>
              <h1 className="mt-3 text-4xl font-extrabold tracking-tight text-[#243d31]">{teaching.title}</h1>
            </div>
            <span className="rounded-full bg-[#e7efe9] px-3 py-1 text-[10px] font-black uppercase tracking-wider text-[#326048]">{devotional?.status ?? "not created"}</span>
          </div>
          <p className="mt-3 text-sm leading-6 text-[#607066]">Devotional publishing is independent from teaching publishing. Once published, the devotional is readable at its own web address even if this teaching is still a draft.</p>
        </header>

        {messages.created === "1" ? <p role="status" className="mt-6 rounded-xl border border-[#326048]/20 bg-[#e7efe9] px-4 py-3 text-sm font-bold text-[#326048]">Devotional created as a draft.</p> : null}
        {messages.assigned === "1" ? <p role="status" className="mt-6 rounded-xl border border-[#326048]/20 bg-[#e7efe9] px-4 py-3 text-sm font-bold text-[#326048]">Devotional assigned to this teaching.</p> : null}
        {messages.removed === "1" ? <p role="status" className="mt-6 rounded-xl border border-[#326048]/20 bg-[#e7efe9] px-4 py-3 text-sm font-bold text-[#326048]">Devotional association removed. The devotional content was not deleted.</p> : null}
        {messages.imported === "1" ? <p role="status" className="mt-6 rounded-xl border border-[#326048]/20 bg-[#e7efe9] px-4 py-3 text-sm font-bold text-[#326048]">Devotional text imported as a draft.</p> : null}
        {messages.published === "1" ? <p role="status" className="mt-6 rounded-xl border border-[#326048]/20 bg-[#e7efe9] px-4 py-3 text-sm font-bold text-[#326048]">Devotional published.</p> : null}
        {messages.unpublished === "1" ? <p role="status" className="mt-6 rounded-xl border border-[#326048]/20 bg-[#e7efe9] px-4 py-3 text-sm font-bold text-[#326048]">Devotional unpublished and returned to draft.</p> : null}

        <DevotionalAssignmentForm
          devotionals={(devotionals ?? []).map((item) => ({ id: item.id, title: item.title, status: item.status }))}
          currentDevotionalId={devotional?.id ?? null}
          assignAction={assignExistingDevotional.bind(null, teaching.id)}
          removeAction={removeDevotionalAssignment.bind(null, teaching.id)}
        />

        <section className="mt-8 rounded-2xl border border-[#284a3b]/10 bg-[#fffdf8] p-6">
          <h2 className="text-2xl font-extrabold text-[#243d31]">Import From Text File</h2>
          <p className="mt-3 text-sm leading-6 text-[#607066]">Upload a prepared devotional text file to create or replace this teaching&apos;s draft devotional content.</p>
          <DevotionalImportForm action={importDevotionalText.bind(null, teaching.id)} hasPublishedDevotional={devotional?.status === "published"} />
        </section>

        {!devotional ? (
          <section className="mt-8 rounded-2xl border border-[#284a3b]/10 bg-[#fffdf8] p-6">
            <h2 className="text-2xl font-extrabold text-[#243d31]">Create 7-Day Devotional</h2>
            <p className="mt-3 text-sm leading-6 text-[#607066]">No devotional records are created by visiting this page.</p>
            <CreateDevotionalForm action={createDevotional.bind(null, teaching.id)} />
          </section>
        ) : (
          <>
            <section className="mt-8 rounded-2xl border border-[#284a3b]/10 bg-[#fffdf8] p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-extrabold text-[#243d31]">Series Information</h2>
                  <p className="mt-2 text-sm text-[#607066]">Current status: <span className="font-extrabold text-[#385245]">{devotional.status}</span></p>
                </div>
                <DevotionalPreviewLink href={`/admin/teachings/${teaching.id}/devotional/preview`} />
              </div>
              <DevotionalSeriesForm devotional={devotional as TeachingDevotional} action={updateDevotionalSeries.bind(null, teaching.id)} />
              <div className="mt-6 flex flex-col gap-3 border-t border-[#284a3b]/10 pt-5 sm:flex-row">
                {devotional.status === "published" ? <UnpublishDevotionalButton action={unpublishDevotional.bind(null, teaching.id)} /> : <PublishDevotionalButton action={publishDevotional.bind(null, teaching.id)} />}
              </div>
            </section>
            <section className="mt-8">
              <h2 className="text-2xl font-extrabold text-[#243d31]">Seven Devotional Days</h2>
              <DevotionalDayForms days={(days ?? []) as DevotionalDay[]} actions={dayActions} />
            </section>
          </>
        )}
      </div>
    </main>
  );
}
