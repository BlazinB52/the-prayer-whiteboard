// How a teaching date is shown anywhere in the admin screens. A gathering_date is a calendar date with no
// time of day, so it is formatted in UTC: formatting it in the viewer's time zone could show the day before.
// Handouts use this first; teachings, weekly updates and the other publications are meant to show the same
// label, so they look identical wherever the date appears.

function toDate(value: string) {
  return new Date(value.length === 10 ? `${value}T00:00:00Z` : value);
}

/** "Saturday, Oct 10, 2026" */
export function formatTeachingDate(value: string | null | undefined) {
  if (!value) return "";
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(date);
}

/** "Oct 10, 2026" */
export function formatTeachingDateShort(value: string | null | undefined) {
  if (!value) return "";
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(date);
}
