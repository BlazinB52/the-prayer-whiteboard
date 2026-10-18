import type { Metadata } from "next";
import Link from "next/link";
import { REVIEW_SUBJECTS, REVIEW_SUBJECT_KINDS, reviewSubjectKind } from "@/lib/review-subjects";
import { requireAdmin } from "@/lib/supabase/admin";
import { clearRevisionHistory } from "./actions";
import { ConfirmButton } from "./confirm-button";
import { OutForReviewSection } from "./out-for-review-section";

export const metadata: Metadata = {
  title: "Revisions",
  robots: { index: false, follow: false },
};

type RevisionRow = {
  id: string;
  teaching_id: string | null;
  subject_type: string;
  subject_title: string;
  status: "draft" | "submitted" | "completed" | "cancelled";
  submitted_by_name: string | null;
  submitted_at: string | null;
  completed_at: string | null;
  completed_by_name: string | null;
  review_note: string | null;
  total_changes: number;
  accepted_count: number;
  rejected_count: number;
  overridden_count: number;
  purged_at: string | null;
  updated_at: string;
};

// The small tag after a title that says what kind of item the revision is about (none for a teaching).
function SubjectBadge({ type }: { type: string }) {
  const badge = REVIEW_SUBJECTS[reviewSubjectKind(type)].badge;
  return badge ? <span className="ml-2 rounded-full bg-[#eee7da] px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-[#6b5a3a]">{badge}</span> : null;
}

function formatDateTime(value: string | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Chicago" }).format(new Date(value));
}

export default async function TeachingRevisionsPage({ searchParams }: { searchParams: Promise<{ closed?: string; cleared?: string; error?: string }> }) {
  const flags = await searchParams;
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase
    .from("content_revisions")
    .select("id, teaching_id, subject_type, subject_title, status, submitted_by_name, submitted_at, completed_at, completed_by_name, review_note, total_changes, accepted_count, rejected_count, overridden_count, updated_at, purged_at")
    .in("subject_type", [...REVIEW_SUBJECT_KINDS])
    .order("updated_at", { ascending: false });

  const revisions = (data ?? []) as RevisionRow[];
  const awaiting = revisions.filter((revision) => revision.status === "submitted");
  const drafts = revisions.filter((revision) => revision.status === "draft");
  const finished = revisions.filter((revision) => revision.status === "completed" || revision.status === "cancelled");

  return (
    <main className="admin-shell">
      <div className="mx-auto max-w-5xl">
        <Link href="/admin" className="text-sm font-extrabold text-[#946332] hover:text-[#a85e32]">Back to dashboard</Link>
        <header className="mt-4 border-b border-[#284a3b]/10 pb-8">
          <h1 className="text-4xl font-extrabold tracking-tight text-[#243d31]">Revisions</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[#607066]">
            Co-editors propose changes to draft teachings, devotionals, weekly updates, teaching outlines and handouts here. Nothing changes until you accept it. Finished reviews stay in Review history, with what was accepted and rejected, until you clear them.
          </p>
        </header>

        {error ? <p className="mt-6 text-sm font-bold text-[#a2472c]">Revisions could not be loaded.</p> : null}
        {flags.error ? <p role="alert" className="mt-6 rounded-xl border border-[#a2472c]/30 bg-[#fbeeea] px-4 py-3 text-sm font-bold text-[#7d2f1a]">{flags.error}</p> : null}
        {flags.closed === "1" ? <p role="status" className="mt-6 rounded-xl border border-[#326048]/20 bg-[#e7efe9] px-4 py-3 text-sm font-bold text-[#326048]">The revision was closed.</p> : null}
        {flags.cleared !== undefined ? <p role="status" className="mt-6 rounded-xl border border-[#326048]/20 bg-[#e7efe9] px-4 py-3 text-sm font-bold text-[#326048]">Cleared {flags.cleared} old {flags.cleared === "1" ? "record" : "records"}.</p> : null}

        <OutForReviewSection supabase={supabase} />

        <section className="mt-10">
          <h2 className="border-b border-[#284a3b]/10 pb-3 text-2xl font-extrabold text-[#243d31]">
            Awaiting review <span className="text-sm font-bold text-[#607066]">({awaiting.length})</span>
          </h2>
          {awaiting.length ? (
            <ul className="divide-y divide-[#284a3b]/10">
              {awaiting.map((revision) => (
                <li key={revision.id}>
                  <Link href={`/admin/teaching-revisions/${revision.id}`} className="flex min-h-14 flex-wrap items-center gap-x-3 gap-y-1 px-2 py-3 transition hover:bg-[#e7efe9]/60">
                    <span className="min-w-0 flex-1 truncate font-extrabold text-[#243d31]">{revision.subject_title}<SubjectBadge type={revision.subject_type} /></span>
                    <span className="text-sm text-[#607066]">{revision.submitted_by_name ?? "Unknown"}</span>
                    <span className="rounded-full bg-[#e8f0fe] px-3 py-1 text-[10px] font-black uppercase tracking-wider text-[#1a4fb4]">{revision.total_changes} {revision.total_changes === 1 ? "change" : "changes"}</span>
                    <span className="hidden w-40 shrink-0 text-right text-sm text-[#607066] sm:inline">{formatDateTime(revision.submitted_at)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-4 text-sm text-[#607066]">Nothing is waiting for review.</p>
          )}
        </section>

        {drafts.length ? (
          <section className="mt-10">
            <h2 className="border-b border-[#284a3b]/10 pb-3 text-2xl font-extrabold text-[#243d31]">
              Drafts in progress <span className="text-sm font-bold text-[#607066]">({drafts.length})</span>
            </h2>
            <ul className="divide-y divide-[#284a3b]/10">
              {drafts.map((revision) => (
                <li key={revision.id}>
                  <Link href={`/admin/teaching-revisions/${revision.id}`} className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-1 px-2 py-3 transition hover:bg-[#e7efe9]/60">
                    <span className="min-w-0 flex-1 truncate font-extrabold text-[#243d31]">{revision.subject_title}<SubjectBadge type={revision.subject_type} /></span>
                    <span className="text-sm text-[#607066]">{revision.submitted_by_name ?? "Unknown"}</span>
                    <span className="rounded-full bg-[#eee7da] px-3 py-1 text-[10px] font-black uppercase tracking-wider text-[#6b5a3a]">Not submitted</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="mt-10">
          <h2 className="border-b border-[#284a3b]/10 pb-3 text-2xl font-extrabold text-[#243d31]">
            Review history <span className="text-sm font-bold text-[#607066]">({finished.length})</span>
          </h2>
          <p className="mt-3 text-sm leading-6 text-[#607066]">
            Open a finished review to see exactly what was accepted and rejected. The wording is kept until you clear the history below. Reviews finished before this was turned on keep only the counts.
          </p>
          {finished.length ? (
            <ul className="mt-3 max-h-[26rem] divide-y divide-[#284a3b]/10 overflow-y-auto rounded-xl border border-[#284a3b]/10 bg-[#fffdf8]">
              {finished.map((revision) => (
                <li key={revision.id} className="text-sm">
                  <Link href={`/admin/teaching-revisions/${revision.id}`} className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-3 ${revision.purged_at ? "pointer-events-none" : "transition hover:bg-[#e7efe9]/60"}`} aria-disabled={revision.purged_at ? true : undefined} tabIndex={revision.purged_at ? -1 : undefined}>
                  <span className="min-w-0 flex-1 truncate font-extrabold text-[#243d31]">{revision.subject_title}<SubjectBadge type={revision.subject_type} /></span>
                  <span className="text-[#607066]">by {revision.submitted_by_name ?? "unknown"}</span>
                  <span className="text-[#607066]">
                    {revision.status === "completed"
                      ? `${revision.accepted_count} accepted${revision.overridden_count ? ` (${revision.overridden_count} anyway)` : ""}, ${revision.rejected_count} rejected${revision.completed_by_name ? ` by ${revision.completed_by_name}` : ""}`
                      : `closed (${revision.review_note ?? "no decision"})`}
                  </span>
                  <span className="text-[#607066]">{formatDateTime(revision.completed_at)}</span>
                  {revision.purged_at ? <span className="rounded-full bg-[#eee7da] px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-[#6b5a3a]">Counts only</span> : <span className="rounded-full bg-[#e8f0fe] px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-[#1a4fb4]">Open</span>}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-4 text-sm text-[#607066]">No finished reviews yet.</p>
          )}

          <form action={clearRevisionHistory} className="mt-6 flex flex-wrap items-end gap-3 rounded-2xl border border-[#284a3b]/10 bg-[#fffdf8] p-4">
            <label className="block text-sm font-bold text-[#385245]">
              Clear history older than (days)
              <input name="days" type="number" min={0} max={3650} defaultValue={30} className="admin-input w-40" />
            </label>
            <ConfirmButton message="Permanently delete finished review records older than this, including the wording that was kept? Reviews still waiting for a decision are never deleted." className="admin-secondary-button">
              Clear old history
            </ConfirmButton>
          </form>
        </section>
      </div>
    </main>
  );
}
