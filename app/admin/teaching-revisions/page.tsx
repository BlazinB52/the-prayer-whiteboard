import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/supabase/admin";
import { clearRevisionHistory } from "./actions";
import { ConfirmButton } from "./confirm-button";

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
  updated_at: string;
};

function formatDateTime(value: string | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Chicago" }).format(new Date(value));
}

export default async function TeachingRevisionsPage({ searchParams }: { searchParams: Promise<{ closed?: string; cleared?: string; error?: string }> }) {
  const flags = await searchParams;
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase
    .from("content_revisions")
    .select("id, teaching_id, subject_type, subject_title, status, submitted_by_name, submitted_at, completed_at, completed_by_name, review_note, total_changes, accepted_count, rejected_count, overridden_count, updated_at")
    .in("subject_type", ["teaching", "devotional", "weekly_update"])
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
            Co-editors propose changes to draft teachings, devotionals and weekly updates here. Nothing changes until you accept it. When one is published, its review text is deleted.
          </p>
        </header>

        {error ? <p className="mt-6 text-sm font-bold text-[#a2472c]">Revisions could not be loaded.</p> : null}
        {flags.error ? <p role="alert" className="mt-6 rounded-xl border border-[#a2472c]/30 bg-[#fbeeea] px-4 py-3 text-sm font-bold text-[#7d2f1a]">{flags.error}</p> : null}
        {flags.closed === "1" ? <p role="status" className="mt-6 rounded-xl border border-[#326048]/20 bg-[#e7efe9] px-4 py-3 text-sm font-bold text-[#326048]">The revision was closed.</p> : null}
        {flags.cleared !== undefined ? <p role="status" className="mt-6 rounded-xl border border-[#326048]/20 bg-[#e7efe9] px-4 py-3 text-sm font-bold text-[#326048]">Cleared {flags.cleared} old {flags.cleared === "1" ? "record" : "records"}.</p> : null}

        <section className="mt-8">
          <h2 className="border-b border-[#284a3b]/10 pb-3 text-2xl font-extrabold text-[#243d31]">
            Awaiting review <span className="text-sm font-bold text-[#607066]">({awaiting.length})</span>
          </h2>
          {awaiting.length ? (
            <ul className="divide-y divide-[#284a3b]/10">
              {awaiting.map((revision) => (
                <li key={revision.id}>
                  <Link href={`/admin/teaching-revisions/${revision.id}`} className="flex min-h-14 flex-wrap items-center gap-x-3 gap-y-1 px-2 py-3 transition hover:bg-[#e7efe9]/60">
                    <span className="min-w-0 flex-1 truncate font-extrabold text-[#243d31]">{revision.subject_title}{revision.subject_type === "devotional" || revision.subject_type === "weekly_update" ? <span className="ml-2 rounded-full bg-[#eee7da] px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-[#6b5a3a]">{revision.subject_type === "weekly_update" ? "Weekly update" : "Devotional"}</span> : null}</span>
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
                    <span className="min-w-0 flex-1 truncate font-extrabold text-[#243d31]">{revision.subject_title}{revision.subject_type === "devotional" || revision.subject_type === "weekly_update" ? <span className="ml-2 rounded-full bg-[#eee7da] px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-[#6b5a3a]">{revision.subject_type === "weekly_update" ? "Weekly update" : "Devotional"}</span> : null}</span>
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
            A finished review keeps only who proposed it, who decided, when, and how many changes were accepted or rejected. The wording itself is deleted.
          </p>
          {finished.length ? (
            <ul className="divide-y divide-[#284a3b]/10">
              {finished.map((revision) => (
                <li key={revision.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-2 py-3 text-sm">
                  <span className="min-w-0 flex-1 truncate font-extrabold text-[#243d31]">{revision.subject_title}{revision.subject_type === "devotional" || revision.subject_type === "weekly_update" ? <span className="ml-2 rounded-full bg-[#eee7da] px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-[#6b5a3a]">{revision.subject_type === "weekly_update" ? "Weekly update" : "Devotional"}</span> : null}</span>
                  <span className="text-[#607066]">by {revision.submitted_by_name ?? "unknown"}</span>
                  <span className="text-[#607066]">
                    {revision.status === "completed"
                      ? `${revision.accepted_count} accepted${revision.overridden_count ? ` (${revision.overridden_count} anyway)` : ""}, ${revision.rejected_count} rejected${revision.completed_by_name ? ` by ${revision.completed_by_name}` : ""}`
                      : `closed (${revision.review_note ?? "no decision"})`}
                  </span>
                  <span className="text-[#607066]">{formatDateTime(revision.completed_at)}</span>
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
            <ConfirmButton message="Permanently delete finished review records older than this? Reviews still waiting for a decision are never deleted." className="admin-secondary-button">
              Clear old history
            </ConfirmButton>
          </form>
        </section>
      </div>
    </main>
  );
}
