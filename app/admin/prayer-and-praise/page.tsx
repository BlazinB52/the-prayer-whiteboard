import type { Metadata } from "next";
import Link from "next/link";
import { isExpiredPrayer, type PrayerNeed, type PraiseReport } from "@/lib/prayer-and-praise";
import { requireAdmin } from "@/lib/supabase/admin";
import {
  archivePraiseReport,
  archivePrayerPoint,
  createPraiseReport,
  createPrayerPoint,
  deletePraiseReport,
  deletePrayerPoint,
  extendPrayerPoint,
  markPrayerAnswered,
  publishPraiseReport,
  publishPrayerPoint,
  returnPraiseReportToDraft,
  updatePraiseReport,
  updatePrayerPoint,
} from "./actions";
import { ConfirmActionButton, DeleteRecordForm, PraiseRecordForm, PrayerRecordForm } from "./prayer-praise-forms";

export const metadata: Metadata = {
  title: "Prayer and Praise",
  robots: { index: false, follow: false },
};

export default async function PrayerAndPraiseAdminPage({ searchParams }: { searchParams: Promise<{ prayer?: string; praise?: string }> }) {
  const messages = await searchParams;
  const { supabase } = await requireAdmin();
  const [{ data: prayers, error: prayerError }, { data: praises, error: praiseError }] = await Promise.all([
    supabase
      .from("prayer_needs")
      .select("id, category, public_summary, status, published_at, expires_at, answered_at, created_at, updated_at")
      .order("updated_at", { ascending: false })
      .order("id", { ascending: false }),
    supabase
      .from("praise_reports")
      .select("id, category, public_summary, status, published_at, created_at, updated_at")
      .order("updated_at", { ascending: false })
      .order("id", { ascending: false }),
  ]);

  if (prayerError || praiseError) {
    return <main className="admin-shell"><p className="text-sm font-bold text-[#a2472c]">Prayer and praise records could not be loaded.</p></main>;
  }

  return (
    <main className="admin-shell">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-col gap-5 border-b border-[#284a3b]/10 pb-8 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Link href="/admin" className="text-sm font-extrabold text-[#946332] hover:text-[#a85e32]">Back to dashboard</Link>
            <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-[#243d31]">Prayer and Praise</h1>
            <p className="mt-3 text-sm text-[#607066]">Create and curate public Points of Agreement and Praise Reports &amp; Answered Prayer.</p>
          </div>
          <Link href="/prayer-and-praise" className="admin-secondary-button inline-flex items-center justify-center">View Public Page</Link>
        </header>

        <StatusMessages prayer={messages.prayer} praise={messages.praise} />

        <section id="points-of-agreement" className="py-10">
          <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
            <section className="rounded-2xl border border-[#284a3b]/10 bg-[#fffdf8] p-6">
              <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#946332]">Points of Agreement</p>
              <h2 className="mt-2 text-2xl font-extrabold text-[#243d31]">Create new prayer point</h2>
              <p className="mt-3 text-sm leading-6 text-[#607066]">New prayer points are saved as drafts until deliberately published.</p>
              <div className="mt-6"><PrayerRecordForm action={createPrayerPoint} /></div>
            </section>
            <div className="space-y-5">
              {(prayers ?? []).length ? (prayers ?? []).map((prayer) => <PrayerAdminCard key={prayer.id} prayer={prayer as PrayerNeed} />) : <EmptyAdminState label="No prayer points yet." />}
            </div>
          </div>
        </section>

        <section id="praise-reports" className="border-t border-[#284a3b]/10 py-10">
          <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
            <section className="rounded-2xl border border-[#284a3b]/10 bg-[#fffdf8] p-6">
              <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#946332]">Praise Reports &amp; Answered Prayer</p>
              <h2 className="mt-2 text-2xl font-extrabold text-[#243d31]">Create praise report</h2>
              <p className="mt-3 text-sm leading-6 text-[#607066]">Praise reports are saved as drafts until deliberately published.</p>
              <div className="mt-6"><PraiseRecordForm action={createPraiseReport} /></div>
            </section>
            <div className="space-y-5">
              {(praises ?? []).length ? (praises ?? []).map((praise) => <PraiseAdminCard key={praise.id} praise={praise as PraiseReport} />) : <EmptyAdminState label="No praise reports yet." />}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function PrayerAdminCard({ prayer }: { prayer: PrayerNeed }) {
  const expired = isExpiredPrayer(prayer);

  return (
    <article className="rounded-2xl border border-[#284a3b]/10 bg-[#fffdf8] p-6 shadow-sm shadow-[#4d5f52]/5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-xl font-extrabold text-[#243d31]">{prayer.category}</h3>
          <p className="mt-2 text-sm leading-6 text-[#607066]">{prayer.public_summary}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wider ${expired ? "bg-[#fff3ed] text-[#a2472c]" : "bg-[#e7efe9] text-[#326048]"}`}>{expired ? "expired" : prayer.status}</span>
      </div>
      <dl className="mt-5 grid gap-2 text-sm text-[#607066] sm:grid-cols-3">
        <div><dt className="font-bold text-[#385245]">Published</dt><dd>{formatDateTime(prayer.published_at)}</dd></div>
        <div><dt className="font-bold text-[#385245]">Expires</dt><dd>{formatDateTime(prayer.expires_at)}</dd></div>
        <div><dt className="font-bold text-[#385245]">Answered</dt><dd>{formatDateTime(prayer.answered_at)}</dd></div>
      </dl>
      <div className="mt-6 border-t border-[#284a3b]/10 pt-5">
        <PrayerRecordForm prayer={prayer} action={updatePrayerPoint.bind(null, prayer.id)} />
        <div className="mt-5 flex flex-wrap items-start gap-3">
          {prayer.status === "draft" ? <ConfirmActionButton action={publishPrayerPoint.bind(null, prayer.id)} label="Publish / Activate" pendingLabel="Publishing..." confirmation="Publish this prayer point for public Points of Agreement?" variant="primary" /> : null}
          {prayer.status === "active" ? <ConfirmActionButton action={extendPrayerPoint.bind(null, prayer.id)} label="Extend 30 Days" pendingLabel="Extending..." /> : null}
          {["draft", "active"].includes(prayer.status) ? <ConfirmActionButton action={markPrayerAnswered.bind(null, prayer.id)} label="Mark Answered" pendingLabel="Marking..." confirmation="Mark this prayer point answered? It will be removed from the public prayer wall." variant="secondary" /> : null}
          {["draft", "active", "answered"].includes(prayer.status) ? <ConfirmActionButton action={archivePrayerPoint.bind(null, prayer.id)} label="Archive" pendingLabel="Archiving..." variant="danger" /> : null}
          <DeleteRecordForm action={deletePrayerPoint.bind(null, prayer.id)} label="Delete Prayer Point" pendingLabel="Deleting..." />
        </div>
      </div>
    </article>
  );
}

function PraiseAdminCard({ praise }: { praise: PraiseReport }) {
  return (
    <article className="rounded-2xl border border-[#284a3b]/10 bg-[#fffdf8] p-6 shadow-sm shadow-[#4d5f52]/5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-xl font-extrabold text-[#243d31]">{praise.category}</h3>
          <p className="mt-2 text-sm leading-6 text-[#607066]">{praise.public_summary}</p>
        </div>
        <span className="rounded-full bg-[#e7efe9] px-3 py-1 text-[10px] font-black uppercase tracking-wider text-[#326048]">{praise.status}</span>
      </div>
      <dl className="mt-5 grid gap-2 text-sm text-[#607066] sm:grid-cols-2">
        <div><dt className="font-bold text-[#385245]">Published</dt><dd>{formatDateTime(praise.published_at)}</dd></div>
        <div><dt className="font-bold text-[#385245]">Updated</dt><dd>{formatDateTime(praise.updated_at)}</dd></div>
      </dl>
      <div className="mt-6 border-t border-[#284a3b]/10 pt-5">
        <PraiseRecordForm praise={praise} action={updatePraiseReport.bind(null, praise.id)} />
        <div className="mt-5 flex flex-wrap items-start gap-3">
          {praise.status === "draft" ? <ConfirmActionButton action={publishPraiseReport.bind(null, praise.id)} label="Publish" pendingLabel="Publishing..." confirmation="Publish this praise report publicly?" variant="primary" /> : null}
          {["draft", "published"].includes(praise.status) ? <ConfirmActionButton action={archivePraiseReport.bind(null, praise.id)} label="Archive" pendingLabel="Archiving..." variant="danger" /> : null}
          {praise.status === "archived" ? <ConfirmActionButton action={returnPraiseReportToDraft.bind(null, praise.id)} label="Return to Draft" pendingLabel="Returning..." /> : null}
          <DeleteRecordForm action={deletePraiseReport.bind(null, praise.id)} label="Delete Praise Report" pendingLabel="Deleting..." />
        </div>
      </div>
    </article>
  );
}

function StatusMessages({ prayer, praise }: { prayer?: string; praise?: string }) {
  const message = prayer ? `Prayer point ${statusLabel(prayer)}.` : praise ? `Praise report ${statusLabel(praise)}.` : null;
  return message ? <p role="status" className="mt-6 rounded-xl border border-[#326048]/20 bg-[#e7efe9] px-4 py-3 text-sm font-bold text-[#326048]">{message}</p> : null;
}

function statusLabel(value: string) {
  const labels: Record<string, string> = {
    saved: "saved",
    published: "published",
    answered: "marked answered",
    extended: "extended for 30 days",
    archived: "archived",
    deleted: "deleted",
    draft: "returned to draft",
  };
  return labels[value] ?? "updated";
}

function EmptyAdminState({ label }: { label: string }) {
  return <section className="rounded-2xl border border-dashed border-[#284a3b]/20 bg-[#fffdf8] p-6 text-sm font-bold text-[#607066]">{label}</section>;
}

function formatDateTime(value: string | null) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
