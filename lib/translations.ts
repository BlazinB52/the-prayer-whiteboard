import { cache } from "react";
import { createClient } from "@supabase/supabase-js";
import type { PageLanguage, TranslationPair } from "./alternates";

// A teaching or devotional is linked to its translation through translation_of (stored on one
// side only), so a twin is found by looking in both directions. Only a published twin counts,
// and any lookup failure means "no twin" rather than an error on a public page.

type TranslatableTable = "teachings" | "teaching_devotionals";

function anonClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const findTwinSlug = cache(async (table: TranslatableTable, slug: string): Promise<string | null> => {
  try {
    const supabase = anonClient();
    const { data: own } = await supabase.from(table).select("id").eq("slug", slug).eq("status", "published").maybeSingle();
    if (!own) return null;
    const { data: ownLink } = await supabase.from(table).select("translation_of").eq("id", own.id).maybeSingle();
    const filter = ownLink?.translation_of ? `id.eq.${ownLink.translation_of},translation_of.eq.${own.id}` : `translation_of.eq.${own.id}`;
    const { data: twins } = await supabase.from(table).select("slug").eq("status", "published").or(filter).neq("id", own.id).limit(1);
    return (twins?.[0]?.slug as string | undefined) || null;
  } catch {
    return null;
  }
});

export function buildPair(language: PageLanguage, ownPath: string, twinPath: string): TranslationPair {
  return language === "es" ? { en: twinPath, es: ownPath } : { en: ownPath, es: twinPath };
}

export async function getTeachingPair(slug: string, language: PageLanguage): Promise<TranslationPair | null> {
  const twin = await findTwinSlug("teachings", slug);
  return twin ? buildPair(language, `/teachings/${slug}`, `/teachings/${twin}`) : null;
}

// suffix is "" for the overview or "/day/3" for a day page.
export async function getDevotionalPair(slug: string, language: PageLanguage, suffix = ""): Promise<TranslationPair | null> {
  const twin = await findTwinSlug("teaching_devotionals", slug);
  return twin ? buildPair(language, `/devotionals/${slug}${suffix}`, `/devotionals/${twin}${suffix}`) : null;
}
