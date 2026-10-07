import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireContentManager } from "@/lib/supabase/admin";
import { TrackedText } from "@/lib/tracked-text";
import {
  buildEditableFields,
  describeChange,
  normalizeRevisionText,
  type CategoryRow,
  type RevisionChangeRow,
  type SectionRow,
  type TeachingRow,
} from "@/lib/teaching-revisions";
import { saveTeachingReview } from "../actions";
import { ReviewEditForm, type ReviewFormField } from "./review-edit-form";

export const metadata: Metadata = {
  title: "Review Teaching",
  robots: { index: false, follow: false },
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RevisionRow = {
  id: string;
  status: "draft" | "submitted" | "completed" | "cancelled";
  submitted_at: string | null;
  completed_at: string | null;
  total_changes: number;
  accepted_count: number;
  rejected_count: number;
};

function formatDateTime(value: string | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Chicago" }).format(new Date(value));
}

export default async function TeachingReviewEditPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ submitted?: string; discarded?: string; new?: string }>;
}) {
  const [{ id }, flags] = await Promise.all([params, searchParams]);
  if (!UUID_PATTERN.test(id)) notFound();

  const { supabase, user } = await requireContentManager();
  const { data: teaching } = await supabase
    .from("teachings")
    .select("id, title, status, central_theme, introduction, summary, teaser_1_heading, teaser_1_text, teaser_2_heading, teaser_2_text")
    .eq("id", id)
    .eq("status", "draft")
    .maybeSingle();
  if (!teaching) notFound();

  const [{ data: categories }, { data: sections }, { data: revisions }] = await Promise.all([
    supabase.from("teaching_categories").select("id, title, sort_order").eq("teaching_id", id).eq("status", "draft").order("sort_order", { ascending: true }),
    supabase.from("teaching_sections").select("id, category_id, title, content, sort_order").eq("teaching_id", id).eq("status", "draft").order("sort_order", { ascending: true }),
    supabase
      .from("content_revisions")
      .select("id, status, submitted_at, completed_at, total_changes, accepted_count, rejected_count")
      .eq("subject_type", "teaching")
      .eq("teaching_id", id)
      .eq("submitted_by", user.id)
      .order("created_at", { ascending: false }),
  ]);

  const fields = buildEditableFields(teaching as TeachingRow, (categories ?? []) as CategoryRow[], (sections ?? []) as SectionRow[]);
  const mine = (revisions ?? []) as RevisionRow[];
  const draft = mine.find((revision) => revision.status === "draft") ?? null;
  const submitted = mine.find((revision) => revision.status === "submitted") ?? null;
  const finished = mine.filter((revision) => revision.status === "completed" || revision.status === "cancelled");

  const openRevision = draft ?? submitted;
  const { data: changeRows } = openRevision
    ? await supabase
        .from("content_revision_changes")
        .select("id, target_kind, target_id, field_key, original_value, proposed_value, change_status, display_order")
        .eq("revision_id", openRevision.id)
        .order("display_order", { ascending: true })
    : { data: [] as RevisionChangeRow[] };
  const changes = (changeRows ?? []) as RevisionChangeRow[];

  // Waiting on the Administrator: show the proposal as tracked changes and nothing editable.
  const showWaiting = !draft && submitted && flags.new !== "1";

  const formFields: ReviewFormField[] = fields.map((field) => {
    const stored = draft ? changes.find((change) => change.target_kind === field.targetKind && change.target_id === field.targetId && change.field_key === field.fieldKey) : undefined;
    const staleProposal = stored ? normalizeRevisionText(field.current) !== normalizeRevisionText(stored.original_value) : false;
    return {
      id: field.id,
      label: field.label,
      context: field.context,
      base: field.current,
      value: stored && !staleProposal ? stored.proposed_value : field.current,
      maxLength: field.maxLength,
      multiline: field.multiline,
      rows: field.rows,
      formatted: field.formatted,
      changedSince: stored && staleProposal ? stored.proposed_value : null,
    };
  });

  return (
    <main className="min-h-screen bg-[#f7f2e8] px-5 py-8 text-[#243126] sm:px-8 sm:py-12">
      <div className="mx-auto max-w-3xl">
        <Link href="/admin/cm/teaching-review" className="text-sm font-extrabold text-[#946332] hover:text-[#a85e32]">Back to Teaching Review</Link>
        <p className="mt-4 text-xs font-extrabold uppercase tracking-[0.18em] text-[#946332]">Review mode</p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-[#243d31] sm:text-4xl">{teaching.title}</h1>
        <p className="mt-3 rounded-xl border border-[#a85e32]/20 bg-[#fff8f1] px-4 py-3 text-sm font-bold leading-6 text-[#6b4a2a]">
          Changes made here are proposals only. The approved teaching will not change until an Administrator accepts them.
        </p>

        {flags.submitted === "1" ? <p role="status" className="mt-4 rounded-xl border border-[#326048]/20 bg-[#e7efe9] px-4 py-3 text-sm font-bold text-[#326048]">Submitted. An Administrator will review your changes.</p> : null}
        {flags.discarded === "1" ? <p role="status" className="mt-4 rounded-xl border border-[#326048]/20 bg-[#e7efe9] px-4 py-3 text-sm font-bold text-[#326048]">Your draft was discarded.</p> : null}

        {showWaiting && submitted ? (
          <section className="mt-8 space-y-5">
            <div className="rounded-2xl border border-[#1a4fb4]/20 bg-[#e8f0fe] p-5">
              <p className="font-extrabold text-[#1a4fb4]">Awaiting Administrator review</p>
              <p className="mt-1 text-sm leading-6 text-[#31456a]">
                You submitted {submitted.total_changes} {submitted.total_changes === 1 ? "change" : "changes"} on {formatDateTime(submitted.submitted_at)}. They cannot be edited now.
                If an Administrator rejects something and you disagree, start a new revision from the current text.
              </p>
            </div>
            {changes.map((change) => {
              const info = describeChange(change, fields);
              return (
                <article key={change.id} className="rounded-2xl border border-[#284a3b]/10 bg-[#fffdf8] p-5 shadow-lg shadow-[#4d5f52]/8">
                  <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-[#946332]">{info.context}</p>
                  <h2 className="mt-1 text-lg font-extrabold text-[#243d31]">{info.label}</h2>
                  <div className="mt-3"><TrackedText original={change.original_value} proposed={change.proposed_value} /></div>
                </article>
              );
            })}
            <Link href={`/admin/cm/teaching-review/${id}?new=1`} className="admin-secondary-button inline-flex items-center justify-center">Start a new revision</Link>
          </section>
        ) : (
          <>
            {draft ? <p className="mt-4 text-sm text-[#607066]">You are editing your saved draft. Other editors cannot change it.</p> : null}
            <ReviewEditForm action={saveTeachingReview.bind(null, id)} fields={formFields} canEdit />
          </>
        )}

        {finished.length ? (
          <section className="mt-10">
            <h2 className="border-b border-[#284a3b]/10 pb-3 text-xl font-extrabold text-[#243d31]">Your earlier reviews of this teaching</h2>
            <ul className="divide-y divide-[#284a3b]/10 text-sm">
              {finished.map((revision) => (
                <li key={revision.id} className="flex flex-wrap items-center gap-3 px-2 py-3">
                  <span className="flex-1 font-bold text-[#385245]">
                    {revision.status === "completed" ? `${revision.accepted_count} accepted, ${revision.rejected_count} rejected` : "Closed without a decision"}
                  </span>
                  <span className="text-[#607066]">{formatDateTime(revision.completed_at)}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </main>
  );
}
