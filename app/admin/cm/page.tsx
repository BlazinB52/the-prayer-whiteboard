import type { Metadata } from "next";
import Link from "next/link";
import { signOut } from "../actions";
import { TeachingDateLabel } from "@/app/teaching-date-label";
import { buildReviewList, type MyRevision, type ReviewSource } from "@/lib/cm-review-list";
import { REVIEW_SUBJECT_KINDS, type ReviewSubjectKind } from "@/lib/review-subjects";
import { requireContentManager } from "@/lib/supabase/admin";

export const metadata: Metadata = {
  title: "Content Management",
  robots: { index: false, follow: false },
};

// The two places where a Content Manager creates something. Everything else they do is review, and that is the list below.
const tools = [
  {
    title: "Points of Agreement",
    description: "Curate the Prayer & Intercession Guide.",
    status: "Available",
    href: "/admin/cm/points-of-agreement",
  },
  {
    title: "Pray for Those in Authority",
    description: "Manage the leaders on the prayer list: photo, name, title, scripture, and prayer.",
    status: "Available",
    href: "/admin/cm/those-in-authority",
  },
];

// Shown to the Administrator only; content managers do not see these.
const adminOnlyTools = [
  {
    title: "Reports",
    description: "See what is done and what is not. Start with Title Collections: every teaching with everything that goes with it.",
    status: "Admin only",
    href: "/admin/cm/reports",
  },
];

function formatSent(value: string | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "America/Chicago" }).format(new Date(value));
}

const SUBJECT_ID_COLUMN: Record<ReviewSubjectKind, string> = {
  teaching: "teaching_id",
  devotional: "devotional_id",
  weekly_update: "weekly_update_id",
  outline: "outline_id",
  handout: "handout_id",
};

export default async function ContentManagementPage() {
  const { supabase, user, role } = await requireContentManager();

  // Only drafts that have been sent for review. The database already hides everything else from a Content Manager.
  const [teachings, devotionals, outlines, handouts, weeklyUpdates, proofings, revisions] = await Promise.all([
    supabase.from("teachings").select("id, title, language, gathering_date, sent_for_review_at").eq("status", "draft").not("sent_for_review_at", "is", null),
    supabase.from("teaching_devotionals").select("id, title, language, gathering_date, sent_for_review_at").eq("status", "draft").not("sent_for_review_at", "is", null),
    supabase.from("teaching_outlines").select("id, title, language, gathering_date, sent_for_review_at").eq("status", "draft").not("sent_for_review_at", "is", null),
    supabase.from("teaching_handouts").select("id, title, language, gathering_date, sent_for_review_at").eq("status", "draft").not("sent_for_review_at", "is", null),
    supabase.from("weekly_updates").select("id, title, language, gathering_date, sent_to_proofing_at").eq("status", "draft").not("sent_to_proofing_at", "is", null),
    supabase.from("weekly_update_proofings").select("weekly_update_id, sent_at, submitted_at").eq("user_id", user.id),
    supabase
      .from("content_revisions")
      .select("id, subject_type, subject_title, status, submitted_at, completed_at, total_changes, accepted_count, rejected_count, teaching_id, devotional_id, weekly_update_id, outline_id, handout_id")
      .eq("submitted_by", user.id)
      .order("created_at", { ascending: false })
      .limit(60),
  ]);
  const failed = [teachings, devotionals, outlines, handouts, weeklyUpdates, revisions].some((result) => result.error);

  type Row = { id: string; title: string; language: string | null; gathering_date: string | null; sent_for_review_at: string | null };
  const gated = (rows: unknown): ReviewSource[] => ((rows as Row[] | null) ?? []).map((row) => ({ id: row.id, title: row.title, language: row.language, gathering_date: row.gathering_date, sent_at: row.sent_for_review_at }));
  const myProofings = new Map(((proofings.data as { weekly_update_id: string; sent_at: string; submitted_at: string | null }[] | null) ?? []).map((row) => [row.weekly_update_id, row]));
  const sources: Record<ReviewSubjectKind, ReviewSource[]> = {
    teaching: gated(teachings.data),
    devotional: gated(devotionals.data),
    outline: gated(outlines.data),
    handout: gated(handouts.data),
    weekly_update: ((weeklyUpdates.data as { id: string; title: string; language: string | null; gathering_date: string | null; sent_to_proofing_at: string | null }[] | null) ?? []).map((row) => ({
      id: row.id, title: row.title, language: row.language, gathering_date: row.gathering_date, sent_at: myProofings.get(row.id)?.sent_at ?? row.sent_to_proofing_at,
    })),
  };
  const myRevisions: MyRevision[] = ((revisions.data as (Record<string, unknown> & { id: string; subject_type: string; subject_title: string })[] | null) ?? []).map((row) => {
    const kind = (REVIEW_SUBJECT_KINDS as readonly string[]).includes(row.subject_type) ? (row.subject_type as ReviewSubjectKind) : "teaching";
    return {
      id: row.id,
      kind,
      subjectId: (row[SUBJECT_ID_COLUMN[kind]] as string | null) ?? null,
      title: row.subject_title,
      status: row.status as MyRevision["status"],
      submitted_at: (row.submitted_at as string | null) ?? null,
      completed_at: (row.completed_at as string | null) ?? null,
      total_changes: Number(row.total_changes ?? 0),
      accepted_count: Number(row.accepted_count ?? 0),
      rejected_count: Number(row.rejected_count ?? 0),
    };
  });
  const { needsReview, history } = buildReviewList({
    sources,
    myRevisions,
    submittedWeeklyUpdates: new Set([...myProofings.entries()].filter(([, row]) => row.submitted_at).map(([id]) => id)),
  });

  return (
    <main className="min-h-screen bg-[#f7f2e8] px-5 py-8 text-[#243126] sm:px-8 sm:py-12">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-col gap-5 border-b border-[#284a3b]/10 pb-8 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#946332]">
              Private workspace
            </p>
            <h1 className="mt-3 text-4xl font-extrabold tracking-tight text-[#243d31] sm:text-5xl">
              Content Management
            </h1>
            <p className="mt-3 text-sm text-[#607066]">Signed in as {user.email}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            {role === "admin" ? (
              <Link href="/admin" className="admin-secondary-button inline-flex items-center justify-center">
                Back to Dashboard
              </Link>
            ) : null}
            <form action={signOut}>
              <button
                type="submit"
                className="min-h-11 rounded-xl border border-[#284a3b]/15 bg-white px-5 font-extrabold text-[#244a3a] transition hover:border-[#a85e32]/40 hover:text-[#a85e32]"
              >
                Sign Out
              </button>
            </form>
          </div>
        </header>

        <section className="py-10">
          <h2 className="border-b border-[#284a3b]/10 pb-3 text-2xl font-extrabold text-[#243d31]">
            Needs your review <span className="text-sm font-bold text-[#607066]">({needsReview.length})</span>
          </h2>
          {failed ? <p role="alert" className="mt-4 text-sm font-bold text-[#a2472c]">Some of the list could not be loaded. Refresh the page; if it stays, tell the Administrator.</p> : null}
          {needsReview.length ? (
            <ul className="divide-y divide-[#284a3b]/10">
              {needsReview.map((item) => (
                <li key={item.key}>
                  <Link href={item.href} className="flex min-h-14 flex-wrap items-center gap-x-4 gap-y-1 px-2 py-3 transition hover:bg-[#e7efe9]/60">
                    <span className="w-44 shrink-0">{item.gatheringDate ? <TeachingDateLabel date={item.gatheringDate} /> : <span className="text-xs font-bold text-[#607066]">No gathering date</span>}</span>
                    <span className="min-w-0 flex-1 font-extrabold text-[#243d31]">
                      {item.kindLabel}
                      {item.language === "es" ? <span className="ml-2 rounded-full bg-[#eee7da] px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-[#6b5a3a]">Español</span> : null}
                      {item.started ? <span className="ml-2 rounded-full bg-[#e8f0fe] px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-[#1a4fb4]">Your draft</span> : null}
                    </span>
                    <span className="shrink-0 text-sm text-[#607066]">{item.sentAt ? `Sent ${formatSent(item.sentAt)}` : ""}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-6 text-sm leading-6 text-[#607066]">Nothing needs your review right now. When the Administrator sends something, it appears here and you get an email.</p>
          )}
        </section>

        <section className="pb-10">
          <h2 className="border-b border-[#284a3b]/10 pb-3 text-2xl font-extrabold text-[#243d31]">Create</h2>
          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            {(role === "admin" ? [...tools, adminOnlyTools[0]] : tools).map((tool) => (
              <Link
                key={tool.title}
                href={tool.href}
                className="block focus-visible:rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#a85e32]"
              >
                <article className="min-h-36 rounded-2xl border border-[#284a3b]/10 bg-[#fffdf8] p-6 shadow-lg shadow-[#4d5f52]/8 transition hover:-translate-y-0.5 hover:border-[#a85e32]/30">
                  <div className="flex items-start justify-between gap-4">
                    <h3 className="text-2xl font-extrabold text-[#243d31]">{tool.title}</h3>
                    <span className="shrink-0 rounded-full bg-[#e7efe9] px-3 py-1 text-[10px] font-black uppercase tracking-wider text-[#326048]">
                      {tool.status}
                    </span>
                  </div>
                  <p className="mt-4 max-w-sm leading-7 text-[#607066]">{tool.description}</p>
                </article>
              </Link>
            ))}
          </div>
        </section>

        {history.length ? (
          <section className="border-t border-[#284a3b]/10 pb-10 pt-8">
            <h2 className="text-2xl font-extrabold text-[#243d31]">Your edits</h2>
            <ul className="mt-3 divide-y divide-[#284a3b]/10">
              {history.map((entry) => (
                <li key={entry.key} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-2 py-3 text-sm">
                  <span className="min-w-0 flex-1 truncate font-extrabold text-[#243d31]">{entry.title} <span className="font-bold text-[#946332]">· {entry.kindLabel}</span></span>
                  <span className="text-[#607066]">{entry.summary}</span>
                  <span className="w-28 shrink-0 text-right text-[#607066]">{formatSent(entry.date)}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </main>
  );
}
