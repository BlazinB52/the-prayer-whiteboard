const DEVOTIONAL_SENDER_FORM_IDS: Readonly<Record<string, string>> = {
  "aliyah-israel-the-harvest-and-prayer": "dyPEr6",
  "beyond-the-garden": "bmZoWn",
  "5787-the-year-of-the-spoken-word-and-divine-rest": "elYnWV",
};

export function getDevotionalSenderFormId(slug: string) {
  return DEVOTIONAL_SENDER_FORM_IDS[slug] ?? null;
}
