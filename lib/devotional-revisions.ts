// Side-effect-free helpers for the devotional review workflow, used by the co-editor page, the
// Administrator review page and the tests. The limits below mirror the database function
// revision_devotional_field_info in 20261007020000_devotional_revisions.sql; keep the two in step.

import { fieldId, type EditableField } from "./teaching-revisions.ts";

export type DevotionalRow = { id: string; title: string; introduction: string | null };
export type DevotionalDayRow = {
  id: string;
  day_number: number;
  title: string;
  anchor_scriptures: string[] | null;
  devotional_reading: string | null;
  confession: string | null;
  journal_prompt: string | null;
  prayer_activation: string | null;
};

/**
 * Every field a co-editor may propose changes to, in reading order, with the approved wording.
 * Left out, so it stays Administrator-only: publishing, language, slug, which teaching it belongs to,
 * and adding or removing days. A day that has not been saved yet has nothing to propose against.
 */
export function buildDevotionalEditableFields(devotional: DevotionalRow, days: DevotionalDayRow[]): EditableField[] {
  const fields: EditableField[] = [];
  const series = (fieldKey: string, label: string, current: string | null, maxLength: number, multiline: boolean, rows: number, formatted: boolean) => {
    fields.push({ id: fieldId("devotional", null, fieldKey), targetKind: "devotional", targetId: null, fieldKey, label, context: "Devotional details", current: current ?? "", maxLength, multiline, rows, formatted });
  };
  series("title", "Devotional title", devotional.title, 180, false, 1, false);
  series("introduction", "Introduction", devotional.introduction, 8000, true, 6, true);

  for (const day of [...days].sort((a, b) => a.day_number - b.day_number)) {
    // Day titles usually begin "Day 1: ...", so the number is only added when the title does not already carry it.
    const dayTitle = day.title.trim();
    const context = !dayTitle ? `Day ${day.day_number}` : /^(?:day|d[ií]a)\s+\d/i.test(dayTitle) ? dayTitle : `Day ${day.day_number} — ${dayTitle}`;
    const add = (fieldKey: string, label: string, current: string, maxLength: number, multiline: boolean, rows: number, formatted: boolean) => {
      fields.push({ id: fieldId("day", day.id, fieldKey), targetKind: "day", targetId: day.id, fieldKey, label, context, current, maxLength, multiline, rows, formatted });
    };
    add("title", "Day title", day.title, 180, false, 1, false);
    add("anchor_scriptures", "Anchor Scriptures (one per line)", (day.anchor_scriptures ?? []).join("\n"), 20019, true, 4, true);
    add("devotional_reading", "Devotional Reading", day.devotional_reading ?? "", 12000, true, 9, true);
    add("confession", "Today's Confession", day.confession ?? "", 3000, true, 4, true);
    add("journal_prompt", "5-Minute Journal Prompt", day.journal_prompt ?? "", 3000, true, 4, true);
    add("prayer_activation", "Prayer Activation Exercise", day.prayer_activation ?? "", 3000, true, 4, true);
  }
  return fields;
}
