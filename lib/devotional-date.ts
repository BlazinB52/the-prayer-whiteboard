// The gathering date of a devotional: the date it was given of its own (the date of the teaching it goes with), or, when it
// has none, the latest gathering date of the teachings it is assigned to. Used wherever devotionals are listed or chosen, so
// they read the same everywhere.

/** Newest date first; an item with no date after the rest, in title order. */
export function sortByDateThenTitle<T extends { date: string | null; title: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    if (a.date && b.date) return b.date.localeCompare(a.date) || a.title.localeCompare(b.title);
    if (a.date) return -1;
    if (b.date) return 1;
    return a.title.localeCompare(b.title);
  });
}

export function devotionalDate(own: string | null | undefined, teachingDates: (string | null | undefined)[]): string | null {
  if (own) return own.slice(0, 10);
  const dates = teachingDates.filter((date): date is string => Boolean(date)).map((date) => date.slice(0, 10)).sort();
  return dates.length ? dates[dates.length - 1] : null;
}
