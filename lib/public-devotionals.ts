import { splitParagraphs, type TeachingDevotional } from "./devotionals";
import { createClient } from "./supabase/server";

export type PublicDevotionalSeries = Pick<
  TeachingDevotional,
  "id" | "teaching_id" | "slug" | "title" | "introduction" | "published_at"
> & {
  teaching: {
    slug: string;
    title: string;
    gathering_date: string | null;
    summary: string | null;
    central_theme: string | null;
  };
};

type DevotionalRow = Pick<
  TeachingDevotional,
  "id" | "teaching_id" | "slug" | "title" | "introduction" | "published_at"
>;

type TeachingRow = PublicDevotionalSeries["teaching"] & { id: string };

export function getDevotionalPath(series: Pick<PublicDevotionalSeries, "slug">) {
  return `/devotionals/${series.slug}`;
}

export function getDevotionalStartPath(series: Pick<PublicDevotionalSeries, "slug">) {
  return `${getDevotionalPath(series)}/start`;
}

export function getDevotionalReadPath(series: Pick<PublicDevotionalSeries, "teaching">) {
  return `/teachings/${series.teaching.slug}/devotional`;
}

export function getDevotionalDescription(series: Pick<PublicDevotionalSeries, "introduction" | "teaching">) {
  return (
    splitParagraphs(series.introduction)[0] ||
    series.teaching.summary ||
    series.teaching.central_theme ||
    `A 7-day devotional for ${series.teaching.title}.`
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
  const teachingIds = devotionalRows.map((devotional) => devotional.teaching_id);
  const { data: teachings, error: teachingError } = await supabase
    .from("teachings")
    .select("id, slug, title, gathering_date, summary, central_theme")
    .eq("status", "published")
    .in("id", teachingIds);

  if (teachingError || !teachings?.length) return [];

  const teachingsById = new Map(
    (teachings as TeachingRow[]).map((teaching) => [teaching.id, teaching]),
  );

  return devotionalRows.flatMap((devotional) => {
    const teaching = teachingsById.get(devotional.teaching_id);
    if (!teaching) return [];

    return [{
      ...devotional,
      teaching: {
        slug: teaching.slug,
        title: teaching.title,
        gathering_date: teaching.gathering_date,
        summary: teaching.summary,
        central_theme: teaching.central_theme,
      },
    }];
  });
}

export async function getPublishedDevotionalSeriesBySlug(slug: string): Promise<PublicDevotionalSeries | null> {
  const supabase = await createClient();
  const { data: devotional, error: devotionalError } = await supabase
    .from("teaching_devotionals")
    .select("id, teaching_id, slug, title, introduction, published_at")
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();

  if (devotionalError || !devotional) return null;

  const devotionalRow = devotional as DevotionalRow;
  const { data: teaching, error: teachingError } = await supabase
    .from("teachings")
    .select("id, slug, title, gathering_date, summary, central_theme")
    .eq("id", devotionalRow.teaching_id)
    .eq("status", "published")
    .maybeSingle();

  if (teachingError || !teaching) return null;

  return {
    ...devotionalRow,
    teaching: {
      slug: teaching.slug,
      title: teaching.title,
      gathering_date: teaching.gathering_date,
      summary: teaching.summary,
      central_theme: teaching.central_theme,
    },
  };
}
