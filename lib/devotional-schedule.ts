// Devotional days are paced off the teaching's publish date rather than any
// per-subscriber counter:
//
//   Saturday   gathering
//   Sunday     weekly update published (noon)
//   Tuesday    teaching published (noon)
//   Wednesday  devotional day 1
//
// So the day number is the whole-calendar-day delta from the teaching's
// published_at. One day after publication is day 1.
//
// The delta is measured in calendar days in a fixed zone, not 24-hour spans, so
// a teaching published at noon still advances the day at local midnight.

export const DEFAULT_DEVOTIONAL_TIME_ZONE = "UTC";

export function devotionalTimeZone() {
  return (process.env.DEVOTIONAL_TIME_ZONE ?? "").trim() || DEFAULT_DEVOTIONAL_TIME_ZONE;
}

function calendarDayNumber(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? "0");
  // Days since epoch in the target zone; the time of day is deliberately dropped.
  return Math.floor(Date.UTC(get("year"), get("month") - 1, get("day")) / 86_400_000);
}

export function calendarDaysBetween(from: Date, to: Date, timeZone = DEFAULT_DEVOTIONAL_TIME_ZONE) {
  return calendarDayNumber(to, timeZone) - calendarDayNumber(from, timeZone);
}

// Returns the day number due today, or null when today falls outside the series.
export function devotionalDayForDate(input: {
  publishedAt: string | Date;
  now: Date;
  totalDays: number;
  timeZone?: string;
}) {
  const publishedAt = input.publishedAt instanceof Date ? input.publishedAt : new Date(input.publishedAt);
  if (Number.isNaN(publishedAt.getTime()) || input.totalDays < 1) return null;

  const dayNumber = calendarDaysBetween(publishedAt, input.now, input.timeZone ?? DEFAULT_DEVOTIONAL_TIME_ZONE);
  if (dayNumber < 1 || dayNumber > input.totalDays) return null;
  return dayNumber;
}
