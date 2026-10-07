// Devotional days are pinned to the day of the week. They are not paced off a
// parent teaching's publish date and not off a per-subscriber counter:
//
//   Saturday   day 1
//   Sunday     day 2
//   Monday     day 3
//   Tuesday    day 4
//   Wednesday  day 5
//   Thursday   day 6
//   Friday     day 7
//
// A cycle always starts on a Saturday with the oldest queued series (see pickNextQueuedSeries), runs
// to Friday, and the next Saturday starts the next queued series. No cycle starts before
// DEVOTIONAL_QUEUE_START_DATE.
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
  Saturday: 1,
  Sunday: 2,
  Monday: 3,
  Tuesday: 4,
  Wednesday: 5,
  Thursday: 6,
  Friday: 7,
};

// The first Saturday a queued cycle may start. Nothing is mailed before this date.
export const DEFAULT_DEVOTIONAL_QUEUE_START_DATE = "2026-10-10";

export function devotionalQueueStartDate() {
  const configured = (process.env.DEVOTIONAL_QUEUE_START_DATE ?? "").trim();
  return /^d{4}-d{2}-d{2}$/.test(configured) ? configured : DEFAULT_DEVOTIONAL_QUEUE_START_DATE;
}

// Today's calendar date (YYYY-MM-DD) in the configured zone.
export function devotionalLocalDate(now: Date, timeZone = DEFAULT_DEVOTIONAL_TIME_ZONE) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function isBeforeDevotionalQueueStart(now: Date, timeZone = DEFAULT_DEVOTIONAL_TIME_ZONE, startDate = devotionalQueueStartDate()) {
  return devotionalLocalDate(now, timeZone) < startDate;
}

export type QueuedSeries = { id: string; published_at: string | null };

// The next series to start on a Saturday: the oldest published one that has never been mailed and
// was published after the most recently mailed series. The "after" rule keeps old series that were
// published before the queue existed (and never mailed) from being sent as if they were new.
// `candidates` must already be ordered oldest published first.
export function pickNextQueuedSeries<T extends QueuedSeries>(candidates: T[], mailedIds: Set<string>, lastMailedPublishedAt: string | null) {
  for (const candidate of candidates) {
    if (mailedIds.has(candidate.id)) continue;
    if (lastMailedPublishedAt && (!candidate.published_at || candidate.published_at <= lastMailedPublishedAt)) continue;
    return candidate;
  }
  return null;
}

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
