import type { Metadata } from "next";
import { LOGO_PATH, SITE_NAME } from "./seo.ts";

export type PageLanguage = "en" | "es";

// The two addresses of one page in English and Español. English is always the x-default.
export type TranslationPair = { en: string; es: string };

// Pages that exist in both languages at fixed addresses. Teachings and devotionals are paired
// in the database instead (see lib/translations.ts).
export const STATIC_TRANSLATIONS = {
  home: { en: "/", es: "/espanol" },
  teacherResources: { en: "/teacher-resources", es: "/espanol/recursos-para-maestros" },
  subscribe: { en: "/subscribe", es: "/espanol/suscribirse" },
  privacy: { en: "/privacy", es: "/espanol/privacidad" },
  copyright: { en: "/copyright-disclaimers", es: "/espanol/derechos-de-autor" },
} as const satisfies Record<string, TranslationPair>;

export function ogLocale(language: PageLanguage) {
  return language === "es" ? "es_SV" : "en_US";
}

export function languageAlternates(pair: TranslationPair) {
  return { en: pair.en, es: pair.es, "x-default": pair.en };
}

// The address of the other language's version of a page, or null when it has none.
export function otherLanguagePath(pair: TranslationPair | null | undefined, language: PageLanguage) {
  if (!pair) return null;
  return language === "es" ? pair.en : pair.es;
}

type PageMetadataInput = {
  title: string | { absolute: string };
  description?: string;
  path: string;
  language?: PageLanguage;
  pair?: TranslationPair | null;
  type?: "website" | "article";
  noindex?: boolean;
  images?: Array<{ url: string; alt: string }>;
  publishedTime?: string | null;
  modifiedTime?: string | null;
};

// One place that keeps canonical, og:url, og:title, og:description, og:locale and the hreflang
// alternates agreeing with each other. A page that sets openGraph replaces the layout's whole
// openGraph block, so the default image is repeated here.
export function buildPageMetadata(input: PageMetadataInput): Metadata {
  const language = input.language ?? "en";
  const plainTitle = typeof input.title === "string" ? input.title : input.title.absolute;
  const images = input.images ?? [{ url: LOGO_PATH, alt: `${SITE_NAME} logo` }];
  const otherLocale = ogLocale(language === "es" ? "en" : "es");
  return {
    title: input.title,
    description: input.description,
    ...(input.noindex ? { robots: { index: false, follow: false } } : {}),
    alternates: { canonical: input.path, ...(input.pair ? { languages: languageAlternates(input.pair) } : {}) },
    openGraph: {
      type: input.type ?? "website",
      siteName: SITE_NAME,
      locale: ogLocale(language),
      ...(input.pair ? { alternateLocale: [otherLocale] } : {}),
      title: plainTitle,
      description: input.description,
      url: input.path,
      images,
      ...(input.publishedTime ? { publishedTime: input.publishedTime } : {}),
      ...(input.modifiedTime ? { modifiedTime: input.modifiedTime } : {}),
    },
    twitter: { card: "summary_large_image", title: plainTitle, description: input.description, images: images.map((image) => image.url) },
  };
}

// Day-page titles: Spanish day titles are stored as "Día 1: …" already, so only add the
// "Day N:" prefix when the stored title doesn't carry it.
export function dayHeading(label: string, dayTitle: string) {
  const title = dayTitle.trim();
  const leading = title.match(/^(?:Day|Día|Dia)\s+\d+\s*[:.\-–—]\s*/i);
  return leading ? title : `${label}: ${title}`;
}

// "Devocional de 7 días: X" already names the format; don't append "| Devocional de 7 días" again.
export function devotionalOverviewTitle(seriesTitle: string, formatLabel: string) {
  return seriesTitle.toLowerCase().includes(formatLabel.toLowerCase()) ? seriesTitle : `${seriesTitle} | ${formatLabel}`;
}

// Sitemap <xhtml:link> alternates for a pair; the URLs must be absolute.
export function sitemapAlternates(pair: TranslationPair, toAbsolute: (path: string) => string) {
  return { languages: { en: toAbsolute(pair.en), es: toAbsolute(pair.es), "x-default": toAbsolute(pair.en) } };
}

// Pairs up linked rows (each row's translation_of points at its twin) into one map keyed by row id,
// valued by the twin's id. Rows without a published twin are left out.
export function linkedTwinIds(rows: Array<{ id: string; translation_of?: string | null }>) {
  const ids = new Set(rows.map((row) => row.id));
  const twins = new Map<string, string>();
  for (const row of rows) {
    if (row.translation_of && ids.has(row.translation_of) && row.translation_of !== row.id) {
      twins.set(row.id, row.translation_of);
      twins.set(row.translation_of, row.id);
    }
  }
  return twins;
}
