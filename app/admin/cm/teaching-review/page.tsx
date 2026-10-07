import type { Metadata } from "next";
import Link from "next/link";
import { requireContentManager } from "@/lib/supabase/admin";

export const metadata: Metadata = {
  title: "Full Teaching - Review",
  robots: { index: false, follow: false },
};

type RevisionRow = {
  id: string;
  teaching_id: string | null;
  subject_title: string;
  status: "draft" | "submitted" | "completed" | "cancelled";
  submitted_at: string | null;
  completed_at: string | null;
  total_changes: number;
  accepted_count: number;
  rejected_count: number;
};

const STATUS_LABELS: Record<RevisionRow["status"], string> = {
  draft: "Your draft",
  submitted: "Awaiting review",
  completed: "Reviewed",
  cancelled: "Closed",
};

function formatDate(value: string | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "America/Chicago" }).format(new Date(value));
}

export default async function TeachingReviewListPage() {
  const { supabase } = await requireContentManager();
  const [{ data: teachings, error }, { data: revisions }] = await Promise.all([
    supabase.from("teachings").select("id, title, gathering_date, language, updated_at").eq("status", "draft").order("updated_at", { ascending: false }),
    supabase
      .from("content_revisions")
      .select("id, teaching_id, subject_title, status, submitted_at, completed_at, total_changes, accepted_count, rejected_count")
      .eq("subject_type", "teaching")
      .order("created_at", { ascending: false }),
  ]);

  const mine = (revisions ?? []) as RevisionRow[];
  const openByTeaching = new Map<string, RevisionRow>();
  for (const revision of mine) {
    if (revision.teaching_id && (revision.status === "draft" || revision.status === "submitted") && !openByTeaching.has(revision.teaching_id)) {
      openByTeaching.set(revision.teaching_id, revision);
    }
  }
  const finished = mine.filter((revision) => revision.status === "completed" || revision.status === "cancelled");

  return (
    <main className="min-h-screen bg-[#f7f2e8] px-5 py-8 text-[#243126] sm:px-8 sm:py-12">
      <div className="mx-auto max-w-4xl">
        <Link href="/admin/cm" className="text-sm font-extrabold text-[#946332] hover:text-[#a85e32]">Back to Content Management</Link>
        <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-[#243d31] sm:text-5xl">Full Teaching - Review</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[#607066]">
          Choose a draft teaching to review. Your edits are proposals only: the teaching does not change until an Administrator accepts them.
        </p>

        {error ? <p className="mt-6 text-sm font-bold text-[#a2472c]">Draft teachings could not be loaded.</p> : null}

        <section className="mt-8">
          <h2 className="border-b border-[#284a3b]/10 pb-3 text-2xl font-extrabold text-[#243d31]">
            Draft teachings <span className="text-sm font-bold text-[#607066]">({teachings?.length ?? 0})</span>
          </h2>
          {teachings?.length ? (
            <ul className="divide-y divide-[#284a3b]/10">
              {teachings.map((teaching) => {
                const open = openByTeaching.get(teaching.id);
                return (
                  <li key={teaching.id}>
                    <Link href={`/admin/cm/teaching-review/${teaching.id}`} className="flex min-h-12 items-center gap-3 px-2 py-3 transition hover:bg-[#e7efe9]/60">
                      <span className="min-w-0 flex-1 truncate font-extrabold text-[#243d31]">{teaching.title}</span>
                      {teaching.language === "es" ? <span className="rounded-full bg-[#eee7da] px-3 py-1 text-[10px] font-black uppercase tracking-wider text-[#6b5a3a]">Español</span> : null}
                      {open ? <span className="rounded-full bg-[#e8f0fe] px-3 py-1 text-[10px] font-black uppercase tracking-wider text-[#1a4fb4]">{STATUS_LABELS[open.status]}</span> : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="py-4 text-sm text-[#607066]">There are no draft teachings to review right now.</p>
          )}
        </section>

        {finished.length ? (
          <section className="mt-10">
            <h2 className="border-b border-[#284a3b]/10 pb-3 text-2xl font-extrabold text-[#243d31]">Your recent reviews</h2>
            <ul className="divide-y divide-[#284a3b]/10">
              {finished.map((revision) => (
                <li key={revision.id} className="flex flex-wrap items-center gap-3 px-2 py-3 text-sm">
                  <span className="min-w-0 flex-1 truncate font-extrabold text-[#243d31]">{revision.subject_title}</span>
                  <span className="text-[#607066]">
                    {revision.status === "completed"
                      ? `${revision.accepted_count} accepted, ${revision.rejected_count} rejected`
                      : "Closed without a decision"}
                  </span>
                  <span className="text-[#607066]">{formatDate(revision.completed_at)}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </main>
  );
}
