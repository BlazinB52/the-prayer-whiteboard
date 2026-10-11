// Helpers for the teaching outline review. The editable fields come from the database
// (outline_review_fields), for the same reason as the weekly update: bold, italic and links live inside
// the stored blocks and only the database can write them as editable wording and back again exactly.
// This file shapes that answer for the shared review screens, and compares an outline with the Word
// file it was uploaded from.

import { reviewFieldsFromRows, type ReviewFieldRow } from "./review-fields.ts";
import type { EditableField } from "./teaching-revisions.ts";

export type OutlineReviewFieldRow = ReviewFieldRow;

export function outlineEditableFields(rows: OutlineReviewFieldRow[] | null | undefined): EditableField[] {
  return reviewFieldsFromRows("outline", rows);
}

type Inline = { text?: unknown };
type Block = { type?: unknown; inlines?: unknown; items?: unknown; rows?: unknown };

function inlineText(inlines: unknown): string {
  return Array.isArray(inlines) ? (inlines as Inline[]).map((inline) => (typeof inline?.text === "string" ? inline.text : "")).join("") : "";
}

/**
 * The plain wording of every editable place in an outline, keyed exactly like the review fields:
 * block_<n> for a heading or paragraph, block_<n>_item_<i> for a list item, block_<n>_cell_<r>_<c> for a
 * table cell. Positions start at 1.
 */
export function outlineTexts(blocks: unknown): Map<string, string> {
  const texts = new Map<string, string>();
  (Array.isArray(blocks) ? blocks : []).forEach((raw, index) => {
    const block = raw as Block | null;
    if (!block || typeof block !== "object") return;
    const position = index + 1;
    if (block.type === "list" && Array.isArray(block.items)) {
      block.items.forEach((item, itemIndex) => texts.set(`block_${position}_item_${itemIndex + 1}`, inlineText((item as Block | null)?.inlines)));
    } else if (block.type === "table" && Array.isArray(block.rows)) {
      block.rows.forEach((row, rowIndex) => {
        if (Array.isArray(row)) row.forEach((cell, cellIndex) => texts.set(`block_${position}_cell_${rowIndex + 1}_${cellIndex + 1}`, inlineText(cell)));
      });
    } else {
      texts.set(`block_${position}`, inlineText(block.inlines));
    }
  });
  return texts;
}

export type OutlineDifference = { key: string; original: string; current: string };

/** Every place whose wording differs between the uploaded outline and how it reads now. Only wording is compared. */
export function compareOutlines(original: unknown, current: unknown): { differences: OutlineDifference[]; sameLength: boolean } {
  const before = outlineTexts(original);
  const after = outlineTexts(current);
  const differences: OutlineDifference[] = [];
  for (const key of new Set([...before.keys(), ...after.keys()])) {
    const originalText = (before.get(key) ?? "").trim();
    const currentText = (after.get(key) ?? "").trim();
    if (originalText !== currentText) differences.push({ key, original: originalText, current: currentText });
  }
  const length = (blocks: unknown) => (Array.isArray(blocks) ? blocks.length : 0);
  return { differences, sameLength: length(original) === length(current) };
}
