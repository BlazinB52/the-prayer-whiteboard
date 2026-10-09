import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/supabase/admin";
import { TrackedText } from "@/lib/tracked-text";
import {
  buildEditableFields,
  describeChange,
  isStale,
  type CategoryRow,
  type RevisionChangeRow,
  type SectionRow,
  type TeachingRow,
} from "@/lib/teaching-revisions";
import { buildDevotionalEditableFields, type DevotionalDayRow, type DevotionalRow } from "@/lib/devotional-revisions";
import { weeklyUpdateEditableFields, type WeeklyUpdateReviewFieldRow } from "@/lib/weekly-update-revisions";
import { cancelRevision, reviewAllChanges, reviewChange } from "../actions";
import { ConfirmButton } from "../confirm-button";
import { MarkOpened } from "../mark-opened";

export const metadata: Metadata = {
  title: "Review Revision",
  robots: { index: false, follow: false },
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RevisionRow = {
  id: string;
  teaching_id: string | null;
  devotional_id: string | null;
  weekly_update_id: string | null;
  subject_type: "teaching" | "devotional" | "weekly_update";
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
};

function formatDateTime(value: string | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Chicago" }).format(new Date(value));
}

const MESSAGES: Record<string, string> = {
  accepted: "Change accepted and applied.",
  accepted_anyway: "Change accepted anyway. The current wording was replaced with the proposal.",
  rejected: "Change rejected. Nothing was changed.",
  finished: "That was the last change. The review is finished and its wording has been deleted.",
  accept: "All remaining changes were accepted and applied.",
  reject: "All remaining changes were rejected.",
};

export default async function TeachingRevisionReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ revisionId: string }>;
  searchParams: Promise<{ done?: string; skipped?: string; error?: string }>;
}) {
  const [{ revisionId }, flags] = await Promise.all([params, searchParams]);
  if (!UUID_PATTERN.test(revisionId)) notFound();

  const { supabase } = await requireAdmin();
  const { data: revisionData } = await supabase
    .from("content_revisions")
    .select("id, teaching_id, devotional_id, weekly_update_id, subject_type, subject_title, status, submitted_by_name, submitted_at, completed_at, completed_by_name, review_note, total_changes, accepted_count, rejected_count, overridden_count")
    .eq("id", revisionId)
    .maybeSingle();
  if (!revisionData) notFound();
  const revision = revisionData as RevisionRow;

  const open = revision.status === "submitted" || revision.status === "draft";
  const teachingId = revision.teaching_id;
  const devotionalId = revision.devotional_id;
  const isDevotional = revision.subject_type === "devotional";
  const weeklyUpdateId = revision.weekly_update_id;
  const isWeeklyUpdate = revision.subject_type === "weekly_update";
  const subject = isDevotional ? "devotional" : isWeeklyUpdate ? "weekly update" : "teaching";

  const [weeklyUpdateResult, weeklyFieldsResult] = await Promise.all([
    open && weeklyUpdateId
      ? supabase.from("weekly_updates").select("id, status").eq("id", weeklyUpdateId).maybeSingle()
      : Promise.resolve({ data: null }),
    open && weeklyUpdateId
      ? supabase.rpc("weekly_update_review_fields", { p_weekly_update_id: weeklyUpdateId })
      : Promise.resolve({ data: [] }),
  ]);
  const [devotionalResult, devotionalDaysResult] = await Promise.all([
    open && devotionalId
      ? supabase.from("teaching_devotionals").select("id, title, introduction, status").eq("id", devotionalId).maybeSingle()
      : Promise.resolve({ data: null }),
    open && devotionalId
      ? supabase.from("teaching_devotional_days").select("id, day_number, title, anchor_scriptures, devotional_reading, confession, journal_prompt, prayer_activation").eq("devotional_id", devotionalId).order("day_number", { ascending: true })
      : Promise.resolve({ data: [] }),
  ]);
  const [teachingResult, categoriesResult, sectionsResult, changesResult] = await Promise.all([
    open && teachingId
      ? supabase.from("teachings").select("id, title, status, central_theme, introduction, summary, teaser_1_heading, teaser_1_text, teaser_2_heading, teaser_2_text").eq("id", teachingId).maybeSingle()
      : Promise.resolve({ data: null }),
    open && teachingId
      ? supabase.from("teaching_categories").select("id, title, sort_order").eq("teaching_id", teachingId).eq("status", "draft").order("sort_order", { ascending: true })
      : Promise.resolve({ data: [] }),
    open && teachingId
      ? supabase.from("teaching_sections").select("id, category_id, title, content, sort_order").eq("teaching_id", teachingId).eq("status", "draft").order("sort_order", { ascending: true })
      : Promise.resolve({ data: [] }),
    open
      ? supabase
          .from("content_revision_changes")
          .select("id, target_kind, target_id, field_key, original_value, proposed_value, change_status, display_order")
          .eq("revision_id", revisionId)
          .order("display_order", { ascending: true })
      : Promise.resolve({ data: [] }),
  ]);

  const teaching = teachingResult.data as (TeachingRow & { status: string }) | null;
  const devotional = devotionalResult.data as (DevotionalRow & { status: string }) | null;
  const weeklyUpdate = weeklyUpdateResult.data as { id: string; status: string } | null;
  const fields = weeklyUpdate
    ? weeklyUpdateEditableFields(weeklyFieldsResult.data as WeeklyUpdateReviewFieldRow[] | null)
    : devotional
    ? buildDevotionalEditableFields(devotional, (devotionalDaysResult.data ?? []) as DevotionalDayRow[])
    : teaching
      ? buildEditableFields(teaching, (categoriesResult.data ?? []) as CategoryRow[], (sectionsResult.data ?? []) as SectionRow[])
      : [];
  const changes = ((changesResult.data ?? []) as RevisionChangeRow[]);
  const pending = changes.filter((change) => change.change_status === "pending");
  const teachingIsDraft = (weeklyUpdate ?? devotional ?? teaching)?.status === "draft";

  return (
    <main className="admin-shell">
      {revision.status === "submitted" ? <MarkOpened revisionId={revision.id} /> : null}
      <div className="mx-auto max-w-4xl">
        <Link href="/admin/teaching-revisions" className="text-sm font-extrabold text-[#946332] hover:text-[#a85e32]">Back to Revisions</Link>
        <header className="mt-4 border-b border-[#284a3b]/10 pb-6">
          <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#946332]">Revision for review</p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-[#243d31] sm:text-4xl">{revision.subject_title}</h1>
          <dl className="mt-4 grid gap-2 text-sm text-[#607066] sm:grid-cols-2">
            <div><dt className="inline font-bold text-[#385245]">Proposed by </dt><dd className="inline">{revision.submitted_by_name ?? "Unknown"}</dd></div>
            <div><dt className="inline font-bold text-[#385245]">Status </dt><dd className="inline capitalize">{revision.status}</dd></div>
            {revision.submitted_at ? <div><dt className="inline font-bold text-[#385245]">Submitted </dt><dd className="inline">{formatDateTime(revision.submitted_at)}</dd></div> : null}
            {revision.completed_at ? <div><dt className="inline font-bold text-[#385245]">Finished </dt><dd className="inline">{formatDateTime(revision.completed_at)}{revision.completed_by_name ? ` by ${revision.completed_by_name}` : ""}</dd></div> : null}
          </dl>
          {isWeeklyUpdate ? <Link href="/admin/weekly-updates" className="mt-4 inline-flex text-sm font-extrabold text-[#9d5a2f] hover:text-[#a85e32]">Open Weekly Updates</Link> : null}
          {isDevotional && devotionalId ? <Link href={`/admin/devotionals/${devotionalId}`} className="mt-4 inline-flex text-sm font-extrabold text-[#9d5a2f] hover:text-[#a85e32]">Open the devotional editor</Link> : null}
          {teachingId ? <Link href={`/admin/teachings/${teachingId}/edit`} className="mt-4 inline-flex text-sm font-extrabold text-[#9d5a2f] hover:text-[#a85e32]">Open the teaching editor</Link> : null}
        </header>

        {flags.error ? <p role="alert" className="mt-6 rounded-xl border border-[#a2472c]/30 bg-[#fbeeea] px-4 py-3 text-sm font-bold text-[#7d2f1a]">{flags.error}</p> : null}
        {flags.done === "partial" ? <p role="status" className="mt-6 rounded-xl border border-[#c49a3a]/40 bg-[#fbf4e1] px-4 py-3 text-sm font-bold text-[#6b5013]">{flags.skipped} {flags.skipped === "1" ? "change was" : "changes were"} skipped because the text changed after it was proposed. Review {flags.skipped === "1" ? "it" : "them"} below, or reject {flags.skipped === "1" ? "it" : "them"}.</p> : null}
        {flags.done && MESSAGES[flags.done] ? <p role="status" className="mt-6 rounded-xl border border-[#326048]/20 bg-[#e7efe9] px-4 py-3 text-sm font-bold text-[#326048]">{MESSAGES[flags.done]}</p> : null}

        {!open ? (
          <section className="mt-8 rounded-2xl border border-[#284a3b]/10 bg-[#fffdf8] p-6">
            <h2 className="text-xl font-extrabold text-[#243d31]">{revision.status === "completed" ? "Review finished" : "Closed without a decision"}</h2>
            <p className="mt-3 leading-7 text-[#52645a]">
              {revision.status === "completed"
                ? `${revision.accepted_count} accepted${revision.overridden_count ? ` (${revision.overridden_count} accepted anyway)` : ""} and ${revision.rejected_count} rejected out of ${revision.total_changes}.`
                : `${revision.total_changes} proposed ${revision.total_changes === 1 ? "change was" : "changes were"} not decided. ${revision.review_note ?? ""}`}
            </p>
            <p className="mt-2 text-sm text-[#607066]">The proposed wording has been deleted. Only this summary is kept.</p>
          </section>
        ) : (
          <>
            {revision.status === "draft" ? (
              <p className="mt-6 rounded-xl border border-[#284a3b]/10 bg-[#fffdf8] px-4 py-3 text-sm leading-6 text-[#607066]">
                This is a draft. The editor has not submitted it, so there is nothing to decide yet. You can close it if it was abandoned.
              </p>
            ) : null}
            {!teachingIsDraft && (teaching || devotional || weeklyUpdate) ? (
              <p role="alert" className="mt-6 rounded-xl border border-[#c49a3a]/40 bg-[#fbf4e1] px-4 py-3 text-sm font-bold text-[#6b5013]">
                This {subject} is no longer a draft, so changes can no longer be applied. Close this revision.
              </p>
            ) : null}

            <p className="mt-6 flex flex-wrap items-center gap-3 text-xs font-bold text-[#607066]">
              <span className="rounded bg-[#fdecea] px-2 py-1 text-[#b3261e] line-through">deleted wording</span>
              <span className="rounded bg-[#e8f0fe] px-2 py-1 text-[#1a4fb4] underline">inserted wording</span>
              <span>Nothing below is applied until you press Accept.</span>
            </p>

            <div className="mt-4 space-y-5">
              {changes.map((change) => {
                const info = describeChange(change, fields);
                const decided = change.change_status !== "pending";
                // Only a change still waiting for a decision can be stale. An accepted change always looks
                // different from its original, because accepting it is what changed the teaching.
                const stale = revision.status === "submitted" && !decided && isStale(change, info.current);
                return (
                  <article key={change.id} className="rounded-2xl border border-[#284a3b]/10 bg-[#fffdf8] p-5 shadow-lg shadow-[#4d5f52]/8">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-[#946332]">{info.context}</p>
                        <h2 className="mt-1 text-lg font-extrabold text-[#243d31]">{info.label}</h2>
                      </div>
                      {decided ? <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wider ${change.change_status === "accepted" ? "bg-[#e7efe9] text-[#326048]" : "bg-[#fbeeea] text-[#a2472c]"}`}>{change.change_status}</span> : null}
                    </div>
                    <div className="mt-3"><TrackedText original={change.original_value} proposed={change.proposed_value} /></div>

                    {stale ? (
                      <div role="alert" className="mt-4 rounded-xl border border-[#c49a3a]/40 bg-[#fbf4e1] p-4 text-sm leading-6 text-[#6b5013]">
                        <p className="font-extrabold">The {subject} changed after this was proposed.</p>
                        <p className="mt-1">{info.found ? "Accept is turned off so newer work is not overwritten by accident. You can reject it, ask the editor to submit a new revision from the current text, or use Accept anyway to replace the current wording with this proposal." : `The part of the ${subject} this refers to no longer exists. Reject it.`}</p>
                        {info.current !== null ? (
                          <details className="mt-2">
                            <summary className="cursor-pointer font-extrabold">Show the current approved text</summary>
                            <p className="mt-2 whitespace-pre-wrap rounded-lg bg-white/70 p-3 text-[#243126]">{info.current || "(empty)"}</p>
                          </details>
                        ) : null}
                      </div>
                    ) : null}

                    {revision.status === "submitted" && !decided ? (
                      <form action={reviewChange} className="mt-4 space-y-3">
                        <input type="hidden" name="revisionId" value={revision.id} />
                        <input type="hidden" name="changeId" value={change.id} />
                        <label className="block text-sm font-bold text-[#385245]">
                          Note (optional)
                          <input name="note" maxLength={1000} className="admin-input" />
                        </label>
                        <div className="flex flex-wrap gap-3">
                          <button type="submit" name="decision" value="accept" disabled={stale || !teachingIsDraft} className="admin-primary-button disabled:cursor-not-allowed disabled:opacity-50"><span>Accept</span></button>
                          {stale && info.found && teachingIsDraft ? (
                            <ConfirmButton
                              name="decision"
                              value="accept_anyway"
                              message={`Accept this change anyway? The ${subject}'s current wording for this field will be replaced with the proposed wording. The newer text will be lost (you can still see it under 'Show the current approved text' before you decide).`}
                              className="min-h-12 rounded-xl border border-[#c49a3a] bg-[#fbf4e1] px-5 font-extrabold text-[#6b5013] transition hover:bg-[#f5e8bd]"
                            >
                              Accept anyway
                            </ConfirmButton>
                          ) : null}
                          <button type="submit" name="decision" value="reject" className="admin-secondary-button">Reject</button>
                        </div>
                      </form>
                    ) : null}
                  </article>
                );
              })}
              {!changes.length ? <p className="text-sm text-[#607066]">There are no changes in this revision.</p> : null}
            </div>

            {revision.status === "submitted" && pending.length ? (
              <section className="mt-8 rounded-2xl border border-[#284a3b]/10 bg-[#fffdf8] p-5">
                <h2 className="text-lg font-extrabold text-[#243d31]">All remaining changes ({pending.length})</h2>
                <div className="mt-4 flex flex-wrap gap-3">
                  <form action={reviewAllChanges}>
                    <input type="hidden" name="revisionId" value={revision.id} />
                    <input type="hidden" name="decision" value="accept" />
                    <ConfirmButton message={`Accept all ${pending.length} remaining changes and apply them to the ${subject}? Any change whose text moved since it was proposed is skipped.`} className="admin-primary-button"><span>Accept All Remaining</span></ConfirmButton>
                  </form>
                  <form action={reviewAllChanges}>
                    <input type="hidden" name="revisionId" value={revision.id} />
                    <input type="hidden" name="decision" value="reject" />
                    <ConfirmButton message={`Reject all ${pending.length} remaining changes? The ${subject} will not be changed.`} className="admin-secondary-button">Reject All Remaining</ConfirmButton>
                  </form>
                </div>
              </section>
            ) : null}

            <section className="mt-8 rounded-2xl border border-[#a2472c]/20 bg-[#fff3ed] p-5">
              <h2 className="text-lg font-extrabold text-[#5d2b1f]">Close without deciding</h2>
              <p className="mt-2 text-sm leading-6 text-[#754033]">For an abandoned revision. Nothing is applied, and the proposed wording is deleted.</p>
              <form action={cancelRevision} className="mt-3 space-y-3">
                <input type="hidden" name="revisionId" value={revision.id} />
                <label className="block text-sm font-bold text-[#5d2b1f]">
                  Note (optional)
                  <input name="note" maxLength={1000} className="admin-input" />
                </label>
                <ConfirmButton message="Close this revision without applying anything? The proposed wording will be deleted." className="min-h-11 rounded-xl bg-[#a2472c] px-5 font-extrabold text-white transition hover:bg-[#8f3823]"><span className="!text-white">Close revision</span></ConfirmButton>
              </form>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
