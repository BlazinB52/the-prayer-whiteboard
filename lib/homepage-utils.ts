export type FeaturedTeachingCandidate = {
  id: string;
  slug: string;
  title: string;
  gathering_date: string | null;
  updated_at: string;
  is_featured: boolean;
  status: string;
};

export type HomepageSection = {
  title: string;
  content: unknown;
};

export function selectFeaturedTeaching(candidates: FeaturedTeachingCandidate[]) {
  return candidates
    .filter((teaching) => teaching.status === "published" && teaching.is_featured)
    .sort((left, right) => {
      const leftDate = left.gathering_date ? Date.parse(`${left.gathering_date}T00:00:00Z`) : Number.NEGATIVE_INFINITY;
      const rightDate = right.gathering_date ? Date.parse(`${right.gathering_date}T00:00:00Z`) : Number.NEGATIVE_INFINITY;
      return rightDate - leftDate || right.updated_at.localeCompare(left.updated_at) || right.id.localeCompare(left.id);
    })[0] ?? null;
}

export function getHomepageSectionExcerpt(content: unknown) {
  const value = content && typeof content === "object" ? content as Record<string, unknown> : {};
  if (value.format === "bullets" && Array.isArray(value.bullets)) {
    const firstBullet = value.bullets.find((bullet): bullet is string => typeof bullet === "string" && Boolean(bullet.trim()));
    if (firstBullet) return firstBullet.trim();
    if (typeof value.introduction === "string" && value.introduction.trim()) return value.introduction.trim();
  }
  if (typeof value.text === "string" && value.text.trim()) return value.text.trim();
  if (typeof value.introduction === "string" && value.introduction.trim()) return value.introduction.trim();
  if (typeof value.quotation === "string" && value.quotation.trim()) return value.quotation.trim();
  return "";
}
