export const SITE_URL = "https://theprayerwhiteboard.com";
export const SITE_NAME = "The Prayer Whiteboard";
export const SITE_DESCRIPTION =
  "Prayer-group teachings, points of agreement, and encouragement from God's Word.";
export const LOGO_PATH = "/images/whiteboard-sword-logo-with-tagline.png";

const DESCRIPTION_LIMIT = 155;

// Search snippets cut off around 155-160 characters, so trim at a word boundary
// and mark the cut rather than letting the engine pick one.
export function truncateDescription(value: string | null | undefined, limit = DESCRIPTION_LIMIT): string | undefined {
  const text = (value ?? "").replace(/\s+/g, " ").trim();
  if (!text) return undefined;
  if (text.length <= limit) return text;
  const cut = text.slice(0, limit - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > limit * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s,;:.\-–—]+$/, "")}…`;
}

// Stable, non-expiring chalkboard image for a teaching (served by
// app/teachings/[slug]/og-image/route.ts); signed storage URLs expire.
export function teachingOgImagePath(slug: string) {
  return `/teachings/${encodeURIComponent(slug)}/og-image`;
}

export function absoluteUrl(path: string) {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

export const NOINDEX = { index: false, follow: false } as const;
