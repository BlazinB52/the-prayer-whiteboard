// The Content Manager's home list: everything that is waiting for their review, whatever kind it is, newest gathering first.
// Pure data shaping; the page does the reading. The database only returns what the Administrator sent to this person, so
// this list is the whole gate for a Content Manager.

import { REVIEW_SUBJECTS, type ReviewSubjectKind } from "./review-subjects.ts";

export const REVIEW_KIND_LABELS: Record<ReviewSubjectKind, string> = {
  teaching: "Teaching",
  devotional: "Devotional",
  weekly_update: "Weekly update",
  outline: "Outline",
  handout: "Handout",
};

export type ReviewSource = {
  id: string;
  title: string;
  language?: string | null;
  gathering_date?: string | null;
  /** When the Administrator sent it (for a weekly update, when it was sent to this person). */
  sent_at?: string | null;
};

export type MyRevision = {
  id: string;
  kind: ReviewSubjectKind;
  subjectId: string | null;
  title: string;
  status: "draft" | "submitted" | "completed" | "cancelled";
  submitted_at: string | null;
  completed_at: string | null;
  total_changes: number;
  accepted_count: number;
  rejected_count: number;
};

export type ReviewListItem = {
  key: string;
  kind: ReviewSubjectKind;
  kindLabel: string;
  id: string;
  title: string;
  language: "en" | "es";
  gatheringDate: string | null;
  sentAt: string | null;
  href: string;
  /** The person has started proposing changes but has not sent them in yet. */
  started: boolean;
};

export type ReviewHistoryItem = {
  key: string;
  kindLabel: string;
  title: string;
  status: MyRevision["status"];
  summary: string;
  date: string | null;
};

/** Newest gathering date first; an item with no date after the rest, then oldest-sent first so nothing waits behind newer items. */
export function sortReviewList(items: ReviewListItem[]): ReviewListItem[] {
  return [...items].sort((a, b) => {
    if (a.gatheringDate && b.gatheringDate && a.gatheringDate !== b.gatheringDate) return b.gatheringDate.localeCompare(a.gatheringDate);
    if (!a.gatheringDate !== !b.gatheringDate) return a.gatheringDate ? -1 : 1;
    return String(a.sentAt ?? "").localeCompare(String(b.sentAt ?? "")) || a.title.localeCompare(b.title);
  });
}

/**
 * What needs this person's review: every item sent to them that they have not already sent their changes in on. An item
 * they have submitted is waiting on the Administrator, not on them, so it moves to the history below.
 */
export function buildReviewList(input: {
  sources: Record<ReviewSubjectKind, ReviewSource[]>;
  myRevisions: MyRevision[];
  /** For weekly updates: the ids this person has already submitted their one pass on. */
  submittedWeeklyUpdates: Set<string>;
}): { needsReview: ReviewListItem[]; history: ReviewHistoryItem[] } {
  const submitted = new Set(input.myRevisions.filter((revision) => revision.status === "submitted" && revision.subjectId).map((revision) => `${revision.kind}:${revision.subjectId}`));
  const started = new Set(input.myRevisions.filter((revision) => revision.status === "draft" && revision.subjectId).map((revision) => `${revision.kind}:${revision.subjectId}`));

  const needsReview: ReviewListItem[] = [];
  for (const kind of Object.keys(input.sources) as ReviewSubjectKind[]) {
    for (const source of input.sources[kind]) {
      const key = `${kind}:${source.id}`;
      if (kind === "weekly_update" ? input.submittedWeeklyUpdates.has(source.id) : submitted.has(key)) continue;
      needsReview.push({
        key,
        kind,
        kindLabel: REVIEW_KIND_LABELS[kind],
        id: source.id,
        title: source.title,
        language: source.language === "es" ? "es" : "en",
        gatheringDate: source.gathering_date ?? null,
        sentAt: source.sent_at ?? null,
        href: `/admin/cm/${REVIEW_SUBJECTS[kind].reviewFolder}/${source.id}`,
        started: started.has(key),
      });
    }
  }

  const history: ReviewHistoryItem[] = input.myRevisions
    .filter((revision) => revision.status !== "draft")
    .map((revision) => ({
      key: revision.id,
      kindLabel: REVIEW_KIND_LABELS[revision.kind],
      title: revision.title,
      status: revision.status,
      summary:
        revision.status === "submitted"
          ? `${revision.total_changes} proposed ${revision.total_changes === 1 ? "change" : "changes"}, waiting on the Administrator`
          : revision.status === "completed"
            ? `${revision.accepted_count} accepted, ${revision.rejected_count} rejected`
            : "Closed without a decision",
      date: revision.status === "submitted" ? revision.submitted_at : revision.completed_at ?? revision.submitted_at,
    }))
    .sort((a, b) => String(b.date ?? "").localeCompare(String(a.date ?? "")));

  return { needsReview: sortReviewList(needsReview), history };
}
