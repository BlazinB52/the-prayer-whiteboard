// Helpers for the weekly update review workflow. Unlike the teaching and devotional reviews, the
// editable fields are not rebuilt here: the database returns them (weekly_update_review_fields), because
// the converted document stores bold, italic and links in blocks and only the database can turn those
// into editable text and back with exactly the same result it later compares against. This file only
// shapes that answer for the shared review screens (lib/review-fields.ts).

import { reviewFieldsFromRows, type ReviewFieldRow } from "./review-fields.ts";
import type { EditableField } from "./teaching-revisions.ts";

export type WeeklyUpdateReviewFieldRow = ReviewFieldRow;

export function weeklyUpdateEditableFields(rows: WeeklyUpdateReviewFieldRow[] | null | undefined): EditableField[] {
  return reviewFieldsFromRows("weekly_update", rows);
}
