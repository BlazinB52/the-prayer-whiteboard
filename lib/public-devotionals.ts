import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { splitParagraphs, type TeachingDevotional } from "./devotionals";
import { createClient } from "./supabase/server";

// Every row reached through this module is already published, and
// teaching_devotionals_published_slug_check guarantees a published row has a
// real slug, so the public projection narrows slug back to a plain string.
export type PublicDevotionalSeries = Pick<
  TeachingDevotional,
  "id" | "teaching_id" | "title" | "introduction" | "published_at"
> & {
  slug: string;
  // Null for a standalone series. Since 20260923020000 a devotional is public
  // on its own status alone, so a teaching is context, not a precondition.
  teaching: {
    slug: string;
    title: string;
    gathering_date: string | null;
    summary: string | null;
    central_theme: string | null;
  } | null;
};

type DevotionalRow = Pick<
  TeachingDevotional,
  "id" | "teaching_id" | "title" | "introduction" | "published_at"
> & { slug: string };

type TeachingRow = NonNullable<PublicDevotionalSeries["teaching"]> & { id: string };

export type PublicDevotionalSeriesWithTeaching = PublicDevotionalSeries & {
  teaching: NonNullable<PublicDevotionalSeries["teaching"]>;
};

type AssignmentRow = { teaching_id: string; devotional_id: string };

export function getDevotionalPath(series: Pick<PublicDevotionalSeries, "slug">) {
  return `/devotionals/${series.slug}`;
}

export function getDevotionalStartPath(series: Pick<PublicDevotionalSeries, "slug">) {
  return `/subscribe?category=devotionals&devotional=${encodeURIComponent(series.slug)}`;
}

// A standalone series has no teaching page to read, so callers fall back to the
// devotional's own page.
export function getDevotionalReadPath(series: Pick<PublicDevotionalSeries, "slug" | "teaching">) {
  return series.teaching ? `/teachings/${series.teaching.slug}/devotional` : `/devotionals/${series.slug}`;
}

export function getDevotionalDescription(series: Pick<PublicDevotionalSeries, "title" | "introduction" | "teaching">) {
  return (
    splitParagraphs(series.introduction)[0] ||
    series.teaching?.summary ||
    series.teaching?.central_theme ||
    (series.teaching ? `A 7-day devotional for ${series.teaching.title}.` : `A 7-day devotional: ${series.title}.`)
  );
}

export function getDevotionalSignupCopy(series?: Pick<PublicDevotionalSeries, "title">) {
  const devotionalName = series?.title || "the current 7-day devotional";
  return `Receive ${devotionalName} and future 7-day devotionals from The Prayer Whiteboard.\nOne devotional email each morning during an active series. Unsubscribe anytime.`;
}

export function getDevotionalStartLabel(series: Pick<PublicDevotionalSeries, "title">) {
  return `Start ${series.title}`;
}

export async function getPublishedDevotionalSeries(): Promise<PublicDevotionalSeries[]> {
  const supabase = await createClient();
  const { data: devotionals, error: devotionalError } = await supabase
    .from("teaching_devotionals")
    .select("id, teaching_id, slug, title, introduction, published_at")
    .eq("status", "published")
    .order("published_at", { ascending: false, nullsFirst: false });

  if (devotionalError || !devotionals?.length) return [];

  const devotionalRows = devotionals as DevotionalRow[];

  // teaching_devotional_assignments is the authoritative teaching mapping, so
  // resolve through it rather than through teaching_devotionals.teaching_id.
  // That column is a legacy backup reference and is null for any devotional
  // authored standalone, which would otherwise drop those series from this list
  // even once they are assigned to a published teaching and published.
  const { data: assignments, error: assignmentError } = await supabase
    .from("teaching_devotional_assignments")
    .select("teaching_id, devotional_id")
    .in("devotional_id", devotionalRows.map((devotional) => devotional.id))
    .order("created_at", { ascending: true });

  if (assignmentError) return [];

  // No assignments at all is now an ordinary case: every published series may
  // be standalone. The teaching lookup is skipped rather than bailing out.
  const assignmentRows = (assignments ?? []) as AssignmentRow[];
  const teachingIds = [...new Set(assignmentRows.map((assignment) => assignment.teaching_id))];
  const { data: teachings, error: teachingError } = teachingIds.length
    ? await supabase
      .from("teachings")
      .select("id, slug, title, gathering_date, summary, central_theme")
      .eq("status", "published")
      .in("id", teachingIds)
    : { data: [], error: null };

  if (teachingError) return [];

  const teachingsById = new Map(
    ((teachings ?? []) as TeachingRow[]).map((teaching) => [teaching.id, teaching]),
  );

  // Published teachings per devotional, kept in assignment order.
  const teachingsByDevotionalId = new Map<string, TeachingRow[]>();
  for (const assignment of assignmentRows) {
    const teaching = teachingsById.get(assignment.teaching_id);
    if (!teaching) continue;
    const current = teachingsByDevotionalId.get(assignment.devotional_id) ?? [];
    current.push(teaching);
    teachingsByDevotionalId.set(assignment.devotional_id, current);
  }

  return devotionalRows.map((devotional) => {
    const assignedTeachings = teachingsByDevotionalId.get(devotional.id) ?? [];
    // One entry per devotional. A devotional may be shared by several published
    // teachings, so prefer the legacy owner when it is one of them and fall back
    // to the earliest assignment. A series reaching no published teaching is
    // still listed, as a standalone one, because since 20260923020000 its own
    // published status is what makes it public.
    const teaching = assignedTeachings.find((item) => item.id === devotional.teaching_id) ?? assignedTeachings[0] ?? null;

    return {
      ...devotional,
      teaching: teaching
        ? {
          slug: teaching.slug,
          title: teaching.title,
          gathering_date: teaching.gathering_date,
          summary: teaching.summary,
          central_theme: teaching.central_theme,
        }
        : null,
    };
  });
}

export async function getPublishedDevotionalSeriesBySlug(slug: string): Promise<PublicDevotionalSeries | null> {
  const supabase = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data: devotional, error: devotionalError } = await supabase
    .from("teaching_devotionals")
    .select("id, teaching_id, slug, title, introduction, published_at")
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();

  if (devotionalError || !devotional) return null;

  const { data: assignments, error: assignmentError } = await supabase
    .from("teaching_devotional_assignments")
    .select("teaching_id")
    .eq("devotional_id", devotional.id);

  if (assignmentError) return null;

  // A standalone series resolves with no teaching rather than 404ing. Its own
  // published status, checked above, is what makes it public.
  const teachingIds = (assignments ?? []).map((assignment) => assignment.teaching_id);
  const { data: teachings, error: teachingError } = teachingIds.length
    ? await supabase
      .from("teachings")
      .select("id, slug, title, gathering_date, summary, central_theme")
      .eq("status", "published")
      .in("id", teachingIds)
    : { data: [], error: null };

  if (teachingError) return null;

  const teaching = (teachings ?? []).find((item) => item.id === devotional.teaching_id) ?? (teachings ?? [])[0] ?? null;

  return {
    ...devotional,
    teaching: teaching
      ? {
        slug: teaching.slug,
        title: teaching.title,
        gathering_date: teaching.gathering_date,
        summary: teaching.summary,
        central_theme: teaching.central_theme,
      }
      : null,
  };
}

// Reached through a teaching, so the teaching is always present. The narrowed
// return type keeps the teaching-scoped pages free of null checks they can
// never hit.
export async function getPublishedDevotionalSeriesByTeachingSlug(slug: string): Promise<PublicDevotionalSeriesWithTeaching | null> {
  const supabase = await createClient();
  const { data: teaching, error: teachingError } = await supabase
    .from("teachings")
    .select("id, slug, title, gathering_date, summary, central_theme")
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();

  if (teachingError || !teaching) return null;

  const { data: assignment, error: assignmentError } = await supabase
    .from("teaching_devotional_assignments")
    .select("devotional_id")
    .eq("teaching_id", teaching.id)
    .maybeSingle();

  if (assignmentError || !assignment) return null;

  const { data: devotional, error: devotionalError } = await supabase
    .from("teaching_devotionals")
    .select("id, teaching_id, slug, title, introduction, published_at")
    .eq("id", assignment.devotional_id)
    .eq("status", "published")
    .maybeSingle();

  if (devotionalError || !devotional) return null;

  return {
    ...devotional,
    teaching: {
      slug: teaching.slug,
      title: teaching.title,
      gathering_date: teaching.gathering_date,
      summary: teaching.summary,
      central_theme: teaching.central_theme,
    },
  };
}
