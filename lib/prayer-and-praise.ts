export const PRAYER_AND_PRAISE_CATEGORIES = [
  "Salvation",
  "Healing",
  "Family Restoration",
  "Provision",
  "Spiritual Growth",
  "Israel",
  "Nations",
  "Community and Region",
  "Other",
] as const;

export const PUBLIC_SUMMARY_MAX_LENGTH = 420;
export const PRIVACY_SUMMARY_HELPER_TEXT = "Write a brief public prayer summary. Do not include names, locations, contact information, medical-record details, information identifying children, or other details that could identify anyone.";

export type PrayerPraiseCategory = (typeof PRAYER_AND_PRAISE_CATEGORIES)[number];
export type PrayerStatus = "draft" | "active" | "answered" | "archived";
export type PraiseStatus = "draft" | "published" | "archived";

export type PrayerNeed = {
  id: string;
  category: PrayerPraiseCategory;
  public_summary: string;
  status: PrayerStatus;
  published_at: string | null;
  expires_at: string | null;
  answered_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PraiseReport = {
  id: string;
  category: PrayerPraiseCategory;
  public_summary: string;
  status: PraiseStatus;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

export function isPrayerPraiseCategory(value: string): value is PrayerPraiseCategory {
  return PRAYER_AND_PRAISE_CATEGORIES.includes(value as PrayerPraiseCategory);
}

export function isExpiredPrayer(prayer: Pick<PrayerNeed, "status" | "expires_at">) {
  return prayer.status === "active" && Boolean(prayer.expires_at) && new Date(prayer.expires_at!).getTime() <= Date.now();
}
