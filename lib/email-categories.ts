export const EMAIL_CATEGORIES = ["weekly_updates", "teachings", "devotionals"] as const;
export type EmailCategory = (typeof EMAIL_CATEGORIES)[number];

export const EMAIL_CATEGORY_LABELS: Record<EmailCategory, string> = {
  weekly_updates: "Weekly Updates",
  teachings: "New Teachings",
  devotionals: "7-Day Devotionals",
};

// Both cards offer the same three choices. Which language(s) a choice is delivered in comes from the
// subscriber's language selection, not from the category.
export const ESPANOL_EMAIL_CATEGORIES = ["weekly_updates", "teachings", "devotionals"] as const satisfies readonly EmailCategory[];

export const EMAIL_CATEGORY_LABELS_ES: Record<EmailCategory, string> = {
  weekly_updates: "Actualizaciones semanales",
  teachings: "Nuevas enseñanzas",
  devotionals: "Devocionales de 7 días",
};

export function emailCategoryLabel(category: EmailCategory, language: "en" | "es" = "en") {
  return (language === "es" ? EMAIL_CATEGORY_LABELS_ES : EMAIL_CATEGORY_LABELS)[category];
}

export function offeredEmailCategories(language: "en" | "es" = "en"): readonly EmailCategory[] {
  return language === "es" ? ESPANOL_EMAIL_CATEGORIES : EMAIL_CATEGORIES;
}

export type PreferenceView = {
  subscriberId: string;
  language: "en" | "es";
  languages: ("en" | "es")[];
  firstName: string;
  emailMasked: string;
  categories: EmailCategory[];
  token: string;
};
