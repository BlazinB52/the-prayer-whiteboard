// The date shown beside a printable PDF: the date of the teaching it goes with, or, for a PDF that has none yet, the
// date it was added. A teaching date is a calendar date with no time of day, so it is formatted in UTC; formatting it in
// the viewer's time zone could show the day before.

export type PrintablePdfDates = { gathering_date: string | null; created_at: string };

export function printablePdfDate(link: PrintablePdfDates, locale: "en-US" | "es", dateStyle: "medium" | "long" = "medium") {
  if (link.gathering_date) {
    const date = new Date(`${link.gathering_date.slice(0, 10)}T00:00:00Z`);
    return { iso: link.gathering_date.slice(0, 10), text: new Intl.DateTimeFormat(locale, { dateStyle, timeZone: "UTC" }).format(date), isTeachingDate: true };
  }
  return { iso: link.created_at, text: new Intl.DateTimeFormat(locale, { dateStyle }).format(new Date(link.created_at)), isTeachingDate: false };
}

/** An optional teaching date from a form: empty means none. */
export function validateOptionalPdfDate(value: unknown) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return { value: null as string | null };
  const parsed = new Date(`${text}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== text) {
    return { error: "The teaching date must be a valid date." };
  }
  return { value: text };
}
