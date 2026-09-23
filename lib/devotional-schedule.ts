// Devotional days are pinned to the day of the week. They are not paced off a
// parent teaching's publish date and not off a per-subscriber counter:
//
//   Wednesday  day 1
//   Thursday   day 2
//   Friday     day 3
//   Saturday   day 4
//   Sunday     day 5
//   Monday     day 6
//   Tuesday    day 7
//
// The weekday is read in DEVOTIONAL_TIME_ZONE rather than in the cron host's
// zone, so the morning run lands on the intended slot no matter where it fires
// from. The default is the ministry's own zone, because an unset variable
// silently falling back to UTC would shift the slot for any run close to
// midnight local time.

export const DEFAULT_DEVOTIONAL_TIME_ZONE = "America/Chicago";

export const DEVOTIONAL_TOTAL_DAYS = 7;

export function devotionalTimeZone() {
  return (process.env.DEVOTIONAL_TIME_ZONE ?? "").trim() || DEFAULT_DEVOTIONAL_TIME_ZONE;
}

const DAY_NUMBER_BY_WEEKDAY: Record<string, number> = {
  Wednesday: 1,
  Thursday: 2,
  Friday: 3,
  Saturday: 4,
  Sunday: 5,
  Monday: 6,
  Tuesday: 7,
};

export function devotionalWeekdayName(now: Date, timeZone = DEFAULT_DEVOTIONAL_TIME_ZONE) {
  return new Intl.DateTimeFormat("en-US", { timeZone, weekday: "long" }).format(now);
}

// Returns the day number due this morning, or null when the weekday maps past
// the end of a shorter series.
export function devotionalDayForWeekday(input: {
  now: Date;
  timeZone?: string;
  totalDays?: number;
}) {
  if (Number.isNaN(input.now.getTime())) return null;

  const totalDays = input.totalDays ?? DEVOTIONAL_TOTAL_DAYS;
  if (totalDays < 1) return null;

  const weekday = devotionalWeekdayName(input.now, input.timeZone ?? DEFAULT_DEVOTIONAL_TIME_ZONE);
  const dayNumber = DAY_NUMBER_BY_WEEKDAY[weekday];
  if (!dayNumber || dayNumber > totalDays) return null;

  return dayNumber;
}
