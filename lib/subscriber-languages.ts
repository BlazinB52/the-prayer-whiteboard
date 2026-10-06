// The language(s) of content a subscriber has chosen. "en" and "es" are the only values, a subscriber
// has at least one, and they may have both.

export type SubscriberLanguage = "en" | "es";
export const SUBSCRIBER_LANGUAGES: readonly SubscriberLanguage[] = ["en", "es"];

/** Clean a stored or submitted list: valid values only, no duplicates, always in en, es order, never empty. */
export function normalizeLanguages(value: unknown, fallback: SubscriberLanguage = "en"): SubscriberLanguage[] {
  const list = Array.isArray(value) ? value : [];
  const cleaned = SUBSCRIBER_LANGUAGES.filter((language) => list.includes(language));
  return cleaned.length ? cleaned : [fallback];
}

export function sameLanguages(left: unknown, right: unknown) {
  const a = normalizeLanguages(left);
  const b = normalizeLanguages(right);
  return a.length === b.length && a.every((language, index) => language === b[index]);
}

/**
 * The signup forms offer two choices: the form's own language only, or both languages.
 * The radio value is "own" or "both".
 */
export function languagesFromScope(scope: unknown, formLanguage: SubscriberLanguage): SubscriberLanguage[] {
  return scope === "both" ? ["en", "es"] : [formLanguage];
}

/** The preferences pages show one checkbox per language (names "language_en" and "language_es"). */
export function languagesFromCheckboxes(formData: FormData): SubscriberLanguage[] {
  return SUBSCRIBER_LANGUAGES.filter((language) => formData.get(`language_${language}`) === "on");
}
