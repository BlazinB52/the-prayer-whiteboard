import type { MetadataRoute } from "next";
import { createClient } from "@supabase/supabase-js";
import { absoluteUrl } from "@/lib/seo";

// Rebuilt at most hourly; published content changes weekly, not per request.
export const revalidate = 3600;

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

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticPages: MetadataRoute.Sitemap = [
    { url: absoluteUrl("/"), changeFrequency: "weekly", priority: 1 },
    { url: absoluteUrl("/deep-dives"), changeFrequency: "weekly", priority: 0.7 },
    { url: absoluteUrl("/devotionals"), changeFrequency: "weekly", priority: 0.7 },
    { url: absoluteUrl("/those-in-authority"), changeFrequency: "weekly", priority: 0.6 },
    { url: absoluteUrl("/points-of-agreement"), changeFrequency: "weekly", priority: 0.6 },
    { url: absoluteUrl("/weekly-update"), changeFrequency: "weekly", priority: 0.5 },
    { url: absoluteUrl("/about"), changeFrequency: "yearly", priority: 0.4 },
    { url: absoluteUrl("/subscribe"), changeFrequency: "yearly", priority: 0.4 },
    { url: absoluteUrl("/pdf"), changeFrequency: "monthly", priority: 0.3 },
    { url: absoluteUrl("/privacy"), changeFrequency: "yearly", priority: 0.2 },
    { url: absoluteUrl("/copyright-disclaimers"), changeFrequency: "yearly", priority: 0.2 },
  ];

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return staticPages;
  const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

  const [teachingsResult, devotionalsResult] = await Promise.all([
    supabase.from("teachings").select("slug, updated_at, published_at").eq("status", "published"),
    supabase.from("teaching_devotionals").select("id, slug, updated_at, published_at").eq("status", "published"),
  ]);

  const teachings = (teachingsResult.data ?? []) as Row[];
  const devotionals = (devotionalsResult.data ?? []) as Array<Row & { id: string }>;

  const daysResult = devotionals.length
    ? await supabase
      .from("teaching_devotional_days")
      .select("devotional_id, day_number, updated_at")
      .in("devotional_id", devotionals.map((devotional) => devotional.id))
    : { data: [] };
  const days = (daysResult.data ?? []) as Array<{ devotional_id: string; day_number: number; updated_at: string | null }>;

  const teachingEntries: MetadataRoute.Sitemap = teachings
    .filter((teaching) => teaching.slug)
    .map((teaching) => ({
      url: absoluteUrl(`/teachings/${teaching.slug}`),
      lastModified: latest(toDate(teaching.updated_at), toDate(teaching.published_at)),
      changeFrequency: "monthly",
      priority: 0.8,
    }));

  const devotionalEntries: MetadataRoute.Sitemap = devotionals
    .filter((devotional) => devotional.slug)
    .flatMap((devotional) => [
      {
        url: absoluteUrl(`/devotionals/${devotional.slug}`),
        lastModified: latest(toDate(devotional.updated_at), toDate(devotional.published_at)),
        changeFrequency: "monthly" as const,
        priority: 0.7,
      },
      ...days
        .filter((day) => day.devotional_id === devotional.id)
        .sort((a, b) => a.day_number - b.day_number)
        .map((day) => ({
          url: absoluteUrl(`/devotionals/${devotional.slug}/day/${day.day_number}`),
          lastModified: latest(toDate(day.updated_at)),
          changeFrequency: "monthly" as const,
          priority: 0.6,
        })),
    ]);

  return [...staticPages, ...teachingEntries, ...devotionalEntries];
}
