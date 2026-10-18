import Link from "next/link";
import { TeachingDateLabel } from "@/app/teaching-date-label";
import { REVIEW_SUBJECTS, type ReviewSubjectKind } from "@/lib/review-subjects";
import type { requireAdmin } from "@/lib/supabase/admin";

type Supabase = Awaited<ReturnType<typeof requireAdmin>>["supabase"];

type Item = { kind: ReviewSubjectKind; id: string; title: string; gatheringDate: string | null; sentAt: string };
type Person = { userId: string; name: string };
type SentRow = { id: string; title: string; gathering_date: string | null; sent_for_review_at?: string | null; sent_to_proofing_at?: string | null };

// The column on content_revisions that names the item a proposal is about.
const REVISION_ITEM_COLUMN: Record<ReviewSubjectKind, string> = {
  teaching: "teaching_id",
  devotional: "devotional_id",
  weekly_update: "weekly_update_id",
  outline: "outline_id",
  handout: "handout_id",
};

function formatDateTime(value: string | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Chicago" }).format(new Date(value));
}

// Everything the Administrator has sent to the Content Managers and not closed: who has it, and what each person has
// done with it so far. Their proposals are listed under "Awaiting review" once they are submitted.
export async function OutForReviewSection({ supabase }: { supabase: Supabase }) {
  const [teachings, devotionals, outlines, handouts, weeklyUpdates, recipients, proofings, oks, openRevisions, managers] = await Promise.all([
    supabase.from("teachings").select("id, title, gathering_date, sent_for_review_at").eq("status", "draft").not("sent_for_review_at", "is", null),
    supabase.from("teaching_devotionals").select("id, title, gathering_date, sent_for_review_at").eq("status", "draft").not("sent_for_review_at", "is", null),
    supabase.from("teaching_outlines").select("id, title, gathering_date, sent_for_review_at").eq("status", "draft").not("sent_for_review_at", "is", null),
    supabase.from("teaching_handouts").select("id, title, gathering_date, sent_for_review_at").eq("status", "draft").not("sent_for_review_at", "is", null),
    supabase.from("weekly_updates").select("id, title, gathering_date, sent_to_proofing_at").eq("status", "draft").not("sent_to_proofing_at", "is", null),
    supabase.from("content_review_recipients").select("subject_type, subject_id, user_id, user_name"),
    supabase.from("weekly_update_proofings").select("weekly_update_id, user_id"),
    supabase.from("content_review_oks").select("subject_type, subject_id, user_id"),
    supabase.from("content_revisions").select("subject_type, status, submitted_by, total_changes, teaching_id, devotional_id, weekly_update_id, outline_id, handout_id").in("status", ["draft", "submitted"]),
    supabase.from("admin_authorizations").select("user_id, display_name").eq("role", "content_manager"),
  ]);
  const failed = [teachings, devotionals, outlines, handouts, weeklyUpdates, recipients, proofings, oks, openRevisions, managers].some((result) => result.error);

  const rows = (kind: ReviewSubjectKind, data: unknown) => ((data as SentRow[] | null) ?? []).map((row) => ({ kind, row }));
  const items: Item[] = [
    ...rows("teaching", teachings.data),
    ...rows("devotional", devotionals.data),
    ...rows("outline", outlines.data),
    ...rows("handout", handouts.data),
    ...rows("weekly_update", weeklyUpdates.data),
  ]
    .map(({ kind, row }) => ({ kind, id: row.id, title: row.title, gatheringDate: row.gathering_date, sentAt: (row.sent_for_review_at ?? row.sent_to_proofing_at) as string }))
    .sort((a, b) => b.sentAt.localeCompare(a.sentAt));

  const names = new Map(((managers.data ?? []) as { user_id: string; display_name: string | null }[]).map((manager) => [manager.user_id, manager.display_name ?? "A Content Manager"]));
  const peopleFor = (item: Item): Person[] => {
    if (item.kind === "weekly_update") {
      return ((proofings.data ?? []) as { weekly_update_id: string; user_id: string }[])
        .filter((row) => row.weekly_update_id === item.id)
        .map((row) => ({ userId: row.user_id, name: names.get(row.user_id) ?? "A Content Manager" }));
    }
    return ((recipients.data ?? []) as { subject_type: string; subject_id: string; user_id: string; user_name: string | null }[])
      .filter((row) => row.subject_type === item.kind && row.subject_id === item.id)
      .map((row) => ({ userId: row.user_id, name: row.user_name ?? names.get(row.user_id) ?? "A Content Manager" }));
  };

  const revisionFor = (item: Item, userId: string) =>
    ((openRevisions.data ?? []) as unknown as Record<string, unknown>[]).find((revision) => revision.subject_type === item.kind && revision.submitted_by === userId && revision[REVISION_ITEM_COLUMN[item.kind]] === item.id);
  const okFor = (item: Item, userId: string) =>
    ((oks.data ?? []) as { subject_type: string; subject_id: string; user_id: string }[]).some((row) => row.subject_type === item.kind && row.subject_id === item.id && row.user_id === userId);

  return (
    <section className="mt-8">
      <h2 className="border-b border-[#284a3b]/10 pb-3 text-2xl font-extrabold text-[#243d31]">
        Out for review <span className="text-sm font-bold text-[#607066]">({items.length})</span>
      </h2>
      <p className="mt-3 text-sm leading-6 text-[#607066]">What you have sent to the Content Managers and are still waiting on, and what each person has done with it so far.</p>
      {failed ? <p className="mt-3 text-sm font-bold text-[#a2472c]">Some of this list could not be loaded.</p> : null}
      {items.length ? (
        <ul className="divide-y divide-[#284a3b]/10">
          {items.map((item) => {
            const subject = REVIEW_SUBJECTS[item.kind];
            return (
              <li key={`${item.kind}-${item.id}`} className="px-2 py-3">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <Link href={subject.adminPath(item.id)} className="min-w-0 flex-1 truncate font-extrabold text-[#243d31] hover:text-[#9d5a2f]">
                    {item.title}
                    {subject.badge ? <span className="ml-2 rounded-full bg-[#eee7da] px-2 py-0.5 align-middle text-[10px] font-black uppercase tracking-wider text-[#6b5a3a]">{subject.badge}</span> : null}
                  </Link>
                  <span className="text-sm text-[#607066]">{item.gatheringDate ? <TeachingDateLabel date={item.gatheringDate} /> : "No gathering date"}</span>
                  <span className="hidden w-44 shrink-0 text-right text-sm text-[#607066] sm:inline">Sent {formatDateTime(item.sentAt)}</span>
                </div>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {peopleFor(item).map((person) => {
                    const revision = revisionFor(item, person.userId);
                    const ok = okFor(item, person.userId);
                    const changes = Number(revision?.total_changes ?? 0);
                    const state = revision?.status === "submitted"
                      ? `submitted ${changes} ${changes === 1 ? "change" : "changes"}`
                      : revision
                        ? "working on a draft"
                        : ok
                          ? "marked OK, nothing to change"
                          : "has not responded yet";
                    const done = ok || revision?.status === "submitted";
                    return (
                      <li key={person.userId} className={`rounded-full px-3 py-1 text-xs font-extrabold ${done ? "bg-[#e7efe9] text-[#326048]" : "bg-[#eee7da] text-[#6b5a3a]"}`}>
                        {person.name}: {state}
                      </li>
                    );
                  })}
                </ul>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="py-4 text-sm text-[#607066]">Nothing is out for review right now.</p>
      )}
    </section>
  );
}
