// Helpers for the handout review. As with teaching outlines, the editable fields come from the database
// (handout_review_fields): bold, italic and links live inside the stored blocks, and only the database can
// write them as editable wording and back again exactly. This file shapes that answer for the shared review
// screens, and compares a handout with the Word file it was uploaded from.

import { outlineTexts } from "./outline-revisions.ts";
import { reviewFieldsFromRows, type ReviewFieldRow } from "./review-fields.ts";
import type { EditableField } from "./teaching-revisions.ts";

export type HandoutReviewFieldRow = ReviewFieldRow;

export function handoutEditableFields(rows: HandoutReviewFieldRow[] | null | undefined): EditableField[] {
  return reviewFieldsFromRows("handout", rows);
}

export type HandoutDifference = { key: string; original: string; current: string };

/** Every place whose wording differs between the uploaded handout and how it reads now. Only wording is compared. */
export function compareHandouts(original: unknown, current: unknown): { differences: HandoutDifference[]; sameLength: boolean } {
  const before = outlineTexts(original);
  const after = outlineTexts(current);
  const differences: HandoutDifference[] = [];
  for (const key of new Set([...before.keys(), ...after.keys()])) {
    const originalText = (before.get(key) ?? "").trim();
    const currentText = (after.get(key) ?? "").trim();
    if (originalText !== currentText) differences.push({ key, original: originalText, current: currentText });
  }
  const length = (blocks: unknown) => (Array.isArray(blocks) ? blocks.length : 0);
  return { differences, sameLength: length(original) === length(current) };
}
