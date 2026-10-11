// Shared by the review screens of every item whose editable fields come from the database (weekly updates
// and teaching outlines). The database turns the stored content into editable wording and back with
// exactly the same result it later compares against, so the screens only reshape its answer.

import { fieldId, type EditableField, type RevisionTargetKind } from "./teaching-revisions.ts";

export type ReviewFieldRow = {
  field_key: string;
  label: string;
  context: string;
  current_value: string | null;
  max_length: number;
  multiline: boolean;
  field_rows: number;
  formatted: boolean;
};

export function reviewFieldsFromRows(targetKind: RevisionTargetKind, rows: ReviewFieldRow[] | null | undefined): EditableField[] {
  return (rows ?? []).map((row) => ({
    id: fieldId(targetKind, null, row.field_key),
    targetKind,
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
