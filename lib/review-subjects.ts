// The one list of things that go through the Content Manager review cycle (teachings, devotionals,
// weekly updates, teaching outlines, handouts). Every screen, email and action that has to know "which kind is this?"
// looks it up here instead of keeping its own list, so a new reviewed type is added in one place (plus its
// database functions; see docs/review-standard.md).

export const REVIEW_SUBJECT_KINDS = ["teaching", "devotional", "weekly_update", "outline", "handout"] as const;
export type ReviewSubjectKind = (typeof REVIEW_SUBJECT_KINDS)[number];

/** Tables that carry the Administrator's gate (sent_for_review_at). Weekly updates send to chosen people instead. */
export type GateTable = "teachings" | "teaching_devotionals" | "teaching_outlines" | "teaching_handouts";

export type ReviewSubject = {
  /** Used in sentences: "this teaching". */
  noun: string;
  /** How the "ready for your review" email names it. */
  emailNoun: string;
  /** Tag on the Revisions screens; none for teachings, which are the default. */
  badge: string | null;
  /** The folder under /admin/cm that holds the Content Manager's list and review pages. */
  reviewFolder: string;
  /** The Administrator's page for the item, where the gate and its other tools live. */
  adminPath: (id: string) => string;
  /** The database function that accepts or rejects one change, and the one that does all that remain. */
  reviewOneRpc: string;
  reviewAllRpc: string;
  /** The table with sent_for_review_at, or null when sending is per person. */
  gateTable: GateTable | null;
};

export const REVIEW_SUBJECTS: Record<ReviewSubjectKind, ReviewSubject> = {
  teaching: {
    noun: "teaching",
    emailNoun: "teaching",
    badge: null,
    reviewFolder: "teaching-review",
    adminPath: (id) => `/admin/teachings/${id}/edit`,
    reviewOneRpc: "review_teaching_revision_change",
    reviewAllRpc: "review_all_teaching_revision_changes",
    gateTable: "teachings",
  },
  devotional: {
    noun: "devotional",
    emailNoun: "7-day devotional",
    badge: "Devotional",
    reviewFolder: "devotional-review",
    adminPath: (id) => `/admin/devotionals/${id}`,
    reviewOneRpc: "review_devotional_revision_change",
    reviewAllRpc: "review_all_devotional_revision_changes",
    gateTable: "teaching_devotionals",
  },
  weekly_update: {
    noun: "weekly update",
    emailNoun: "weekly update",
    badge: "Weekly update",
    reviewFolder: "weekly-update-review",
    adminPath: () => "/admin/weekly-updates",
    reviewOneRpc: "review_weekly_update_revision_change",
    reviewAllRpc: "review_all_weekly_update_revision_changes",
    gateTable: null,
  },
  outline: {
    noun: "teaching outline",
    emailNoun: "teaching outline",
    badge: "Outline",
    reviewFolder: "outline-review",
    adminPath: (id) => `/admin/outlines/${id}`,
    reviewOneRpc: "review_outline_revision_change",
    reviewAllRpc: "review_all_outline_revision_changes",
    gateTable: "teaching_outlines",
  },
  handout: {
    noun: "handout",
    emailNoun: "handout",
    badge: "Handout",
    reviewFolder: "handout-review",
    adminPath: (id) => `/admin/handouts/${id}`,
    reviewOneRpc: "review_handout_revision_change",
    reviewAllRpc: "review_all_handout_revision_changes",
    gateTable: "teaching_handouts",
  },
};

/** Narrows a stored subject_type (or any string) to a known kind; unknown values fall back to a teaching. */
export function reviewSubjectKind(value: unknown): ReviewSubjectKind {
  return (REVIEW_SUBJECT_KINDS as readonly unknown[]).includes(value) ? (value as ReviewSubjectKind) : "teaching";
}

/** The kinds that have the Administrator's send/take-back gate (every kind except the weekly update). */
export type GatedKind = Exclude<ReviewSubjectKind, "weekly_update">;

/** The gate table for a kind that has one. */
export function gateTableFor(kind: GatedKind): GateTable {
  return REVIEW_SUBJECTS[kind].gateTable as GateTable;
}
