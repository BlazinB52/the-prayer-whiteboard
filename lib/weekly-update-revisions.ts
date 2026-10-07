// Helpers for the weekly update review workflow. Unlike the teaching and devotional reviews, the
// editable fields are not rebuilt here: the database returns them (weekly_update_review_fields), because
// the converted document stores bold, italic and links in blocks and only the database can turn those
// into editable text and back with exactly the same result it later compares against. This file only
// shapes that answer for the shared review screens.

import { fieldId, type EditableField } from "./teaching-revisions.ts";

export type WeeklyUpdateReviewFieldRow = {
  field_key: string;
  label: string;
  context: string;
  current_value: string | null;
  max_length: number;
  multiline: boolean;
  field_rows: number;
  formatted: boolean;
};

export function weeklyUpdateEditableFields(rows: WeeklyUpdateReviewFieldRow[] | null | undefined): EditableField[] {
  return (rows ?? []).map((row) => ({
    id: fieldId("weekly_update", null, row.field_key),
    targetKind: "weekly_update",
    targetId: null,
    fieldKey: row.field_key,
    label: row.label,
    context: row.context,
    current: row.current_value ?? "",
    maxLength: row.max_length,
    multiline: row.multiline,
    rows: row.field_rows,
    formatted: row.formatted,
  }));
}
