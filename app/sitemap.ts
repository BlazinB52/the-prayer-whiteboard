import type { MetadataRoute } from "next";
import { createClient } from "@supabase/supabase-js";
import { STATIC_TRANSLATIONS, linkedTwinIds, sitemapAlternates, type TranslationPair } from "@/lib/alternates";
import { getSpanishDevotionalIds } from "@/lib/spanish-devotionals";
import { absoluteUrl } from "@/lib/seo";

// Rebuilt at most hourly; published content changes weekly, not per request.
export const revalidate = 3600;

type TranslatedRow = Row & { id: string; language?: string; translation_of?: string | null };
type Row = { slug?: string; updated_at: string | null; published_at?: string | null };

function toDate(value: string | null | undefined) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function latest(...values: Array<Date | undefined>) {
  const dates = values.filter((value): value is Date => Boolean(value));
  return dates.length ? new Date(Math.max(...dates.map((date) => date.getTime()))) : undefined;
}

const alternatesFor = (pair: TranslationPair) => sitemapAlternates(pair, absoluteUrl);

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const T = STATIC_TRANSLATIONS;
  const staticPages: MetadataRoute.Sitemap = [
    { url: absoluteUrl("/"), changeFrequency: "weekly", priority: 1, alternates: alternatesFor(T.home) },
    { url: absoluteUrl("/espanol"), changeFrequency: "weekly", priority: 0.8, alternates: alternatesFor(T.home) },
    { url: absoluteUrl("/deep-dives"), changeFrequency: "weekly", priority: 0.7 },
    { url: absoluteUrl("/devotionals"), changeFrequency: "weekly", priority: 0.7 },
    { url: absoluteUrl("/teacher-resources"), changeFrequency: "weekly", priority: 0.6, alternates: alternatesFor(T.teacherResources) },
    { url: absoluteUrl("/espanol/recursos-para-maestros"), changeFrequency: "weekly", priority: 0.5, alternates: alternatesFor(T.teacherResources) },
    { url: absoluteUrl("/those-in-authority"), changeFrequency: "weekly", priority: 0.6 },
    { url: absoluteUrl("/points-of-agreement"), changeFrequency: "weekly", priority: 0.6 },
    { url: absoluteUrl("/weekly-update"), changeFrequency: "weekly", priority: 0.5 },
    { url: absoluteUrl("/about"), changeFrequency: "yearly", priority: 0.4 },
    { url: absoluteUrl("/subscribe"), changeFrequency: "yearly", priority: 0.4, alternates: alternatesFor(T.subscribe) },
    { url: absoluteUrl("/espanol/suscribirse"), changeFrequency: "yearly", priority: 0.3, alternates: alternatesFor(T.subscribe) },
    { url: absoluteUrl("/pdf"), changeFrequency: "monthly", priority: 0.3 },
    { url: absoluteUrl("/privacy"), changeFrequency: "yearly", priority: 0.2, alternates: alternatesFor(T.privacy) },
    { url: absoluteUrl("/espanol/privacidad"), changeFrequency: "yearly", priority: 0.2, alternates: alternatesFor(T.privacy) },
    { url: absoluteUrl("/copyright-disclaimers"), changeFrequency: "yearly", priority: 0.2, alternates: alternatesFor(T.copyright) },
    { url: absoluteUrl("/espanol/derechos-de-autor"), changeFrequency: "yearly", priority: 0.2, alternates: alternatesFor(T.copyright) },
  ];

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return staticPages;
  const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

  const [teachingsResult, devotionalsResult, outlinesResult] = await Promise.all([
    supabase.from("teachings").select("id, slug, language, translation_of, updated_at, published_at").eq("status", "published"),
    supabase.from("teaching_devotionals").select("id, slug, translation_of, updated_at, published_at").eq("status", "published"),
    supabase.from("teaching_outlines").select("slug, language, updated_at, published_at").eq("status", "published"),
  ]);

  // Before the translation_of migration is applied these selects fail; fall back to no alternates.
  const teachingsFallback = teachingsResult.error
    ? await supabase.from("teachings").select("id, slug, language, updated_at, published_at").eq("status", "published")
    : null;
  const devotionalsFallback = devotionalsResult.error
    ? await supabase.from("teaching_devotionals").select("id, slug, updated_at, published_at").eq("status", "published")
    : null;
  const teachings = ((teachingsFallback ?? teachingsResult).data ?? []) as TranslatedRow[];
  const outlines = (outlinesResult.data ?? []) as Array<Row & { language: string }>;
  const devotionals = ((devotionalsFallback ?? devotionalsResult).data ?? []) as Array<TranslatedRow & { id: string }>;
  const spanishDevotionalIds = await getSpanishDevotionalIds(supabase);
  const teachingTwins = linkedTwinIds(teachings);
  const devotionalTwins = linkedTwinIds(devotionals);
  const teachingById = new Map(teachings.map((teaching) => [teaching.id, teaching]));
  const devotionalById = new Map(devotionals.map((devotional) => [devotional.id, devotional]));
  const pairOf = (own: { slug?: string; language?: string }, twin: { slug?: string } | undefined, prefix: string, suffix: string, ownIsSpanish: boolean): TranslationPair | null =>
    own.slug && twin?.slug ? (ownIsSpanish ? { en: `${prefix}/${twin.slug}${suffix}`, es: `${prefix}/${own.slug}${suffix}` } : { en: `${prefix}/${own.slug}${suffix}`, es: `${prefix}/${twin.slug}${suffix}` }) : null;

  const daysResult = devotionals.length
    ? await supabase
      .from("teaching_devotional_days")
      .select("devotional_id, day_number, updated_at")
      .in("devotional_id", devotionals.map((devotional) => devotional.id))
    : { data: [] };
  const days = (daysResult.data ?? []) as Array<{ devotional_id: string; day_number: number; updated_at: string | null }>;

  const teachingEntries: MetadataRoute.Sitemap = teachings
    .filter((teaching) => teaching.slug)
    .map((teaching) => {
      const twinId = teachingTwins.get(teaching.id);
      const pair = twinId ? pairOf(teaching, teachingById.get(twinId), "/teachings", "", teaching.language === "es") : null;
      return {
      ...(pair ? { alternates: alternatesFor(pair) } : {}),
      url: absoluteUrl(`/teachings/${teaching.slug}`),
      lastModified: latest(toDate(teaching.updated_at), toDate(teaching.published_at)),
      changeFrequency: "monthly",
      priority: 0.8,
      };
    });

  const devotionalEntries: MetadataRoute.Sitemap = devotionals
    .filter((devotional) => devotional.slug)
    .flatMap((devotional) => {
      const twinId = devotionalTwins.get(devotional.id);
      const twin = twinId ? devotionalById.get(twinId) : undefined;
      const isSpanish = spanishDevotionalIds.has(devotional.id);
      const pairFor = (suffix: string) => pairOf(devotional, twin, "/devotionals", suffix, isSpanish);
      const overviewPair = pairFor("");
      return [
      {
        ...(overviewPair ? { alternates: alternatesFor(overviewPair) } : {}),
        url: absoluteUrl(`/devotionals/${devotional.slug}`),
        lastModified: latest(toDate(devotional.updated_at), toDate(devotional.published_at)),
        changeFrequency: "monthly" as const,
        priority: 0.7,
      },
      ...days
        .filter((day) => day.devotional_id === devotional.id)
        .sort((a, b) => a.day_number - b.day_number)
        .map((day) => {
          const dayPair = pairFor(`/day/${day.day_number}`);
          return {
          ...(dayPair ? { alternates: alternatesFor(dayPair) } : {}),
          url: absoluteUrl(`/devotionals/${devotional.slug}/day/${day.day_number}`),
          lastModified: latest(toDate(day.updated_at)),
          changeFrequency: "monthly" as const,
          priority: 0.6,
          };
        }),
      ];
    });

  const outlineEntries: MetadataRoute.Sitemap = outlines
    .filter((outline) => outline.slug)
    .map((outline) => ({
      url: absoluteUrl(outline.language === "es" ? `/espanol/recursos-para-maestros/${outline.slug}` : `/teacher-resources/${outline.slug}`),
      lastModified: latest(toDate(outline.updated_at), toDate(outline.published_at)),
      changeFrequency: "monthly" as const,
      priority: 0.5,
    }));

  return [...staticPages, ...teachingEntries, ...devotionalEntries, ...outlineEntries];
}
