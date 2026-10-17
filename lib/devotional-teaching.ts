// Which published teaching a devotional reads through to. One rule for the public day page's
// "Return to full teaching" link and for the daily email's "Read the Full Teaching" button, so the
// two can never disagree: the devotional's original teaching when it is still assigned and
// published, otherwise the first published teaching it is assigned to (in assignment order).
// A devotional with no published teaching has none, and callers hide the link.

export type PublishedTeaching = { id: string; slug: string };

export function pickPublishedTeaching<T extends PublishedTeaching>(input: {
  legacyTeachingId: string | null;
  /** Assigned teaching ids, in assignment order. */
  assignedTeachingIds: string[];
  publishedTeachings: T[];
}): T | null {
  const published = new Map(input.publishedTeachings.map((teaching) => [teaching.id, teaching]));
  const preferred = input.legacyTeachingId ? published.get(input.legacyTeachingId) : undefined;
  if (preferred && input.assignedTeachingIds.includes(preferred.id)) return preferred;
  for (const id of input.assignedTeachingIds) {
    const teaching = published.get(id);
    if (teaching) return teaching;
  }
  return null;
}

export function teachingUrl(baseUrl: string, teachingSlug: string) {
  return `${baseUrl.replace(/\/+$/, "")}/teachings/${encodeURIComponent(teachingSlug)}`;
}

// The structural slice of a Supabase client these reads need, so the daily send (service role) and
// the admin test send (session client) share one lookup.
type TeachingLookupClient = {
  from: (table: string) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
};

export async function loadPublishedTeachingForDevotional(supabase: TeachingLookupClient, devotionalId: string): Promise<PublishedTeaching | null> {
  const [{ data: devotional }, { data: assignments }] = await Promise.all([
    supabase.from("teaching_devotionals").select("teaching_id").eq("id", devotionalId).maybeSingle(),
    supabase.from("teaching_devotional_assignments").select("teaching_id").eq("devotional_id", devotionalId).order("created_at", { ascending: true }),
  ]);
  const assignedTeachingIds = ((assignments ?? []) as { teaching_id: string }[]).map((row) => row.teaching_id);
  if (!assignedTeachingIds.length) return null;

  const { data: teachings } = await supabase.from("teachings").select("id, slug").eq("status", "published").in("id", assignedTeachingIds);
  return pickPublishedTeaching({
    legacyTeachingId: (devotional?.teaching_id as string | null | undefined) ?? null,
    assignedTeachingIds,
    publishedTeachings: (teachings ?? []) as PublishedTeaching[],
  });
}
