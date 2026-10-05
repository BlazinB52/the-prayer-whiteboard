import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { createClient } from "@/lib/supabase/server";
import { getPublishedDevotionalSeries } from "@/lib/public-devotionals";
import { selectFeaturedTeaching, type FeaturedTeachingCandidate } from "@/lib/homepage-utils";

export type EspanolTeaching = FeaturedTeachingCandidate & {
  central_theme: string | null;
  introduction: string | null;
  summary: string | null;
  teaser_1_heading: string | null;
  teaser_1_text: string | null;
  teaser_2_heading: string | null;
  teaser_2_text: string | null;
  chalkboard_asset_id: string | null;
};

export type EspanolGathering = { id: string; slug: string; title: string; gathering_date: string | null; devotionalSlug: string | null };
export type EspanolDeepDive = { id: string; slug: string; title: string; gathering_date: string | null; summary: string | null; central_theme: string | null };
export type EspanolDevotional = { id: string; slug: string; title: string; introduction: string | null };
export type EspanolChalkboard = { url: string; altText: string; caption: string | null };

export type EspanolHomepageData = {
  featured: (EspanolTeaching & { devotionalSlug: string | null }) | null;
  teasers: { id: string; heading: string; text: string }[];
  chalkboard: EspanolChalkboard | null;
  gatherings: EspanolGathering[];
  deepDives: EspanolDeepDive[];
  devotionals: EspanolDevotional[];
};

const FEATURED_COLUMNS = "id, slug, title, gathering_date, is_featured, status, central_theme, introduction, summary, teaser_1_heading, teaser_1_text, teaser_2_heading, teaser_2_text, chalkboard_asset_id";
const CHALKBOARD_SIGNED_URL_TTL_SECONDS = 60 * 60;

async function getSignedChalkboard(assetId: string | null): Promise<EspanolChalkboard | null> {
  if (!assetId) return null;
  const signer = createServiceRoleClient();
  if (!signer) return null;
  const { data: asset, error } = await signer
    .from("chalkboard_assets")
    .select("id, alt_text, caption, website_storage_path, storage_path")
    .eq("id", assetId)
    .eq("is_current_version", true)
    .eq("status", "active")
    .maybeSingle();
  if (error || !asset) return null;

  for (const path of [asset.website_storage_path, asset.storage_path].filter((value): value is string => Boolean(value))) {
    const { data, error: signError } = await signer.storage.from("chalkboards").createSignedUrl(path, CHALKBOARD_SIGNED_URL_TTL_SECONDS);
    if (!signError && data?.signedUrl) return { url: data.signedUrl, altText: asset.alt_text, caption: asset.caption };
  }
  return null;
}

async function getPublishedDevotionalSlugsByTeachingId(teachingIds: string[]) {
  const slugs = new Map<string, string>();
  if (!teachingIds.length) return slugs;
  const supabase = await createClient();
  const { data: assignments } = await supabase.from("teaching_devotional_assignments").select("teaching_id, devotional_id").in("teaching_id", teachingIds);
  if (!assignments?.length) return slugs;
  const { data: devotionals } = await supabase
    .from("teaching_devotionals")
    .select("id, slug")
    .eq("status", "published")
    .in("id", [...new Set(assignments.map((assignment) => assignment.devotional_id))]);
  const slugByDevotionalId = new Map((devotionals ?? []).map((devotional) => [devotional.id, devotional.slug as string]));
  for (const assignment of assignments) {
    const slug = slugByDevotionalId.get(assignment.devotional_id);
    if (slug) slugs.set(assignment.teaching_id, slug);
  }
  return slugs;
}

/** Everything the Español homepage shows: only teachings, devotionals and chalkboards that are in Español. */
export async function getEspanolHomepageData(): Promise<EspanolHomepageData> {
  const supabase = await createClient();

  const [{ data: standard }, { data: deepDives }, devotionals] = await Promise.all([
    supabase
      .from("teachings")
      .select(FEATURED_COLUMNS)
      .eq("status", "published")
      .eq("teaching_type", "standard")
      .eq("language", "es")
      .order("gathering_date", { ascending: false, nullsFirst: false })
      .order("id", { ascending: false }),
    supabase
      .from("teachings")
      .select("id, slug, title, gathering_date, summary, central_theme")
      .eq("status", "published")
      .eq("teaching_type", "deep_dive")
      .eq("language", "es")
      .order("gathering_date", { ascending: false, nullsFirst: false })
      .order("title", { ascending: true }),
    getPublishedDevotionalSeries("es"),
  ]);

  const teachings = (standard ?? []) as EspanolTeaching[];
  // Prefer the teaching flagged featured; otherwise fall back to the newest Español teaching.
  const picked = selectFeaturedTeaching(teachings);
  const featured = (picked ? teachings.find((teaching) => teaching.id === picked.id) : null) ?? teachings[0] ?? null;
  const devotionalSlugs = await getPublishedDevotionalSlugsByTeachingId(teachings.map((teaching) => teaching.id));

  let chalkboardId: string | null = featured?.chalkboard_asset_id ?? null;
  if (featured) {
    const { data: assignments } = await supabase
      .from("teaching_chalkboard_assignments")
      .select("chalkboard_asset_id, display_order")
      .eq("teaching_id", featured.id)
      .order("display_order", { ascending: true })
      .limit(1);
    chalkboardId = assignments?.[0]?.chalkboard_asset_id ?? chalkboardId;
  }

  return {
    featured: featured ? { ...featured, devotionalSlug: devotionalSlugs.get(featured.id) ?? null } : null,
    teasers: featured
      ? [
          { id: "teaser-1", heading: featured.teaser_1_heading?.trim() ?? "", text: featured.teaser_1_text?.trim() ?? "" },
          { id: "teaser-2", heading: featured.teaser_2_heading?.trim() ?? "", text: featured.teaser_2_text?.trim() ?? "" },
        ].filter((teaser) => teaser.heading && teaser.text)
      : [],
    chalkboard: await getSignedChalkboard(chalkboardId),
    gatherings: teachings.map((teaching) => ({
      id: teaching.id,
      slug: teaching.slug,
      title: teaching.title,
      gathering_date: teaching.gathering_date,
      devotionalSlug: devotionalSlugs.get(teaching.id) ?? null,
    })),
    deepDives: (deepDives ?? []) as EspanolDeepDive[],
    devotionals: devotionals.map((series) => ({ id: series.id, slug: series.slug, title: series.title, introduction: series.introduction })),
  };
}
