// Shared, side-effect-free helpers for the teaching review workflow. Used by the co-editor page, the
// Administrator review page and the tests. The limits below mirror the database functions in
// 20261006030000_content_revisions.sql (revision_field_info); keep the two in step.

export type RevisionTargetKind = "teaching" | "category" | "section";

export type TeachingRow = {
  id: string;
  title: string;
  central_theme: string | null;
  introduction: string | null;
  summary: string | null;
  teaser_1_heading: string | null;
  teaser_1_text: string | null;
  teaser_2_heading: string | null;
  teaser_2_text: string | null;
};
export type CategoryRow = { id: string; title: string; sort_order: number };
export type SectionRow = { id: string; category_id: string; title: string; content: unknown; sort_order: number };

export type EditableField = {
  /** "kind:target:field", also the form field name suffix. */
  id: string;
  targetKind: RevisionTargetKind;
  targetId: string | null;
  fieldKey: string;
  label: string;
  /** Where the field sits, for example "Category One › Faithful (Paragraph)". */
  context: string;
  /** The approved wording right now. */
  current: string;
  maxLength: number;
  /** A single line, or a multi-line wording box. */
  multiline: boolean;
  rows: number;
  /** Bold, italic and link controls apply (the wording boxes of the teaching). */
  formatted: boolean;
};

const NO_TARGET = "-";

export function fieldId(kind: RevisionTargetKind, targetId: string | null, fieldKey: string) {
  return `${kind}:${targetId ?? NO_TARGET}:${fieldKey}`;
}

export function parseFieldId(id: string): { targetKind: RevisionTargetKind; targetId: string | null; fieldKey: string } | null {
  const [kind, target, ...rest] = id.split(":");
  const fieldKey = rest.join(":");
  if ((kind !== "teaching" && kind !== "category" && kind !== "section") || !target || !fieldKey) return null;
  return { targetKind: kind, targetId: target === NO_TARGET ? null : target, fieldKey };
}

/** Same rule as the database: line endings made uniform, then trimmed. */
export function normalizeRevisionText(value: unknown) {
  return String(value ?? "").replace(/\r\n?/g, "\n").trim();
}

function content(row: SectionRow): Record<string, unknown> {
  return row.content && typeof row.content === "object" && !Array.isArray(row.content) ? (row.content as Record<string, unknown>) : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

const FORMAT_LABELS: Record<string, string> = { paragraph: "Paragraph", takeaway: "Takeaway", bullets: "Bullets", scripture: "Scripture" };

/**
 * Every field a co-editor may propose changes to, in reading order, with the approved wording.
 * What is left out stays Administrator-only: the gathering date, teaching type, language, slug,
 * chalkboards, footer, devotional links, publish status, section format and callouts, order, adding
 * or removing sections, and a scripture's translation (it decides the copyright notice).
 */
export function buildEditableFields(teaching: TeachingRow, categories: CategoryRow[], sections: SectionRow[]): EditableField[] {
  const fields: EditableField[] = [];
  const teachingField = (fieldKey: string, label: string, current: string | null, maxLength: number, multiline: boolean, rows: number, formatted: boolean) => {
    fields.push({ id: fieldId("teaching", null, fieldKey), targetKind: "teaching", targetId: null, fieldKey, label, context: "Teaching details", current: current ?? "", maxLength, multiline, rows, formatted });
  };
  teachingField("title", "Title", teaching.title, 160, false, 1, false);
  teachingField("central_theme", "Central theme", teaching.central_theme, 400, false, 1, false);
  teachingField("introduction", "Introduction", teaching.introduction, 5000, true, 6, true);
  teachingField("summary", "Short summary", teaching.summary, 500, true, 4, true);
  teachingField("teaser_1_heading", "Homepage teaser 1 heading", teaching.teaser_1_heading, 100, false, 1, false);
  teachingField("teaser_1_text", "Homepage teaser 1 text", teaching.teaser_1_text, 300, true, 3, false);
  teachingField("teaser_2_heading", "Homepage teaser 2 heading", teaching.teaser_2_heading, 100, false, 1, false);
  teachingField("teaser_2_text", "Homepage teaser 2 text", teaching.teaser_2_text, 300, true, 3, false);

  for (const category of [...categories].sort((a, b) => a.sort_order - b.sort_order)) {
    fields.push({ id: fieldId("category", category.id, "title"), targetKind: "category", targetId: category.id, fieldKey: "title", label: "Category title", context: category.title, current: category.title, maxLength: 160, multiline: false, rows: 1, formatted: false });
    for (const section of sections.filter((item) => item.category_id === category.id).sort((a, b) => a.sort_order - b.sort_order)) {
      const data = content(section);
      const format = text(data.format);
      const context = `${category.title} › ${section.title} (${FORMAT_LABELS[format] ?? "Section"})`;
      const add = (fieldKey: string, label: string, current: string, maxLength: number, multiline: boolean, rows: number, formatted: boolean) => {
        fields.push({ id: fieldId("section", section.id, fieldKey), targetKind: "section", targetId: section.id, fieldKey, label, context, current, maxLength, multiline, rows, formatted });
      };
      add("title", "Section title", section.title, 160, false, 1, false);
      if (format === "paragraph" || format === "takeaway") {
        add("text", format === "takeaway" ? "Takeaway text" : "Text", text(data.text), 12000, true, 8, true);
      } else if (format === "bullets") {
        const bullets = Array.isArray(data.bullets) ? data.bullets.filter((item): item is string => typeof item === "string") : [];
        add("introduction", "Introductory note", text(data.introduction), 12000, true, 3, true);
        add("bullets", "Bullets (one per line)", bullets.join("\n"), 12000, true, Math.max(4, bullets.length + 1), false);
        add("conclusion", "Concluding text", text(data.conclusion), 12000, true, 3, true);
      } else if (format === "scripture") {
        add("introduction", "Introductory note", text(data.introduction), 12000, true, 3, true);
        add("reference", "Scripture reference", text(data.reference), 240, false, 1, false);
        add("quotation", "Scripture quotation", text(data.quotation), 12000, true, 5, true);
      }
    }
  }
  return fields;
}

/** The label shown for a stored change, found from the teaching's current structure. */
export function describeChange(change: { target_kind: string; target_id: string | null; field_key: string }, fields: EditableField[]) {
  const match = fields.find((field) => field.id === fieldId(change.target_kind as RevisionTargetKind, change.target_id, change.field_key));
  return match
    ? { label: match.label, context: match.context, current: match.current, found: true }
    : { label: change.field_key.replace(/_/g, " "), context: "This part of the teaching no longer exists", current: null as string | null, found: false };
}

export type RevisionChangeRow = {
  id: string;
  target_kind: string;
  target_id: string | null;
  field_key: string;
  original_value: string;
  proposed_value: string;
  change_status: "pending" | "accepted" | "rejected";
  display_order: number;
};

/** True when the approved wording is no longer what the proposal was written against. */
export function isStale(change: Pick<RevisionChangeRow, "original_value">, currentValue: string | null) {
  return currentValue === null || normalizeRevisionText(currentValue) !== normalizeRevisionText(change.original_value);
}

/** Errors from the database functions, turned into plain words. */
export function friendlyRevisionError(message: string | undefined | null) {
  const text = String(message ?? "");
  if (text.startsWith("conflict:")) {
    return text.replace(/^conflict:\s*/, "") + " Your edits are still on this page, but nothing was saved. Copy the wording you want to keep, reload, and apply it to the current text.";
  }
  if (text.startsWith("stale:")) return text.replace(/^stale:\s*/, "");
  if (/not allowed|only an administrator|only the person/i.test(text)) return text;
  return text || "Something went wrong. Please try again.";
}
