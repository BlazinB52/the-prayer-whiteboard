export const EMAIL_CATEGORIES = ["weekly_updates", "teachings", "devotionals"] as const;
export type EmailCategory = (typeof EMAIL_CATEGORIES)[number];

export const EMAIL_CATEGORY_LABELS: Record<EmailCategory, string> = {
  weekly_updates: "Weekly Updates",
  teachings: "New Teachings",
  devotionals: "7-Day Devotionals",
};

export type PreferenceView = {
  subscriberId: string;
  firstName: string;
  emailMasked: string;
  categories: EmailCategory[];
  token: string;
};
