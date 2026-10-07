import { cache } from "react";
import { createClient } from "@supabase/supabase-js";
import { toLanguage, type Language } from "./i18n";
import { isSpanishDevotional } from "./spanish-devotionals";

// The language of the page at a request path, for <html lang>. Español content is recognised by
// the language stored in the database, never by a list of slugs; the static Español pages have no
// database row, so they are recognised by living under /espanol.

export function pathSegments(pathname: string) {
  return pathname.split("?")[0].split("/").filter(Boolean).map((segment) => {
    try {
      return decodeURIComponent(segment);
    } catch {
      return segment;
    }
  });
}

const lookup = cache(async (kind: "teaching" | "devotional" | "teaching-devotional", slug: string): Promise<Language> => {
  try {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    if (kind === "teaching") {
      const { data } = await supabase.from("teachings").select("language").eq("slug", slug).eq("status", "published").maybeSingle();
      return toLanguage(data?.language);
    }
    if (kind === "devotional") {
      const { data } = await supabase.from("teaching_devotionals").select("id").eq("slug", slug).eq("status", "published").maybeSingle();
      return data && (await isSpanishDevotional(supabase, data.id)) ? "es" : "en";
    }
    const { data: teaching } = await supabase.from("teachings").select("id").eq("slug", slug).eq("status", "published").maybeSingle();
    if (!teaching) return "en";
    const { data: assignment } = await supabase.from("teaching_devotional_assignments").select("devotional_id").eq("teaching_id", teaching.id).maybeSingle();
    return assignment && (await isSpanishDevotional(supabase, assignment.devotional_id)) ? "es" : "en";
  } catch {
    return "en";
  }
});

export async function getPageLanguage(pathname: string | null | undefined): Promise<Language> {
  const [first, second, third] = pathSegments(pathname ?? "/");
  if (first === "espanol" || first === "español") return "es";
  if (first === "teachings" && second) {
    if (third === "devotional") return lookup("teaching-devotional", second);
    return third ? "en" : lookup("teaching", second);
  }
  if (first === "devotionals" && second && second !== "start") return lookup("devotional", second);
  return "en";
}
