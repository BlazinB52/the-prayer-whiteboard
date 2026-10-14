import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getAuthorizedUser } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { buildTeachingTranslationDocx, type ExportCategory, type ExportSection, type ExportTeaching } from "@/lib/teaching-docx-export";
import { parseTeachingDocx } from "@/lib/teaching-docx-import";
import { translateTeaching } from "@/lib/teaching-auto-translate";
import { createDraftTeaching } from "@/lib/teaching-create";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Each category is translated as its own request, several at a time; a long teaching still takes a minute or two.
export const maxDuration = 300;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// "Convert & Save Spanish Version": translates an English teaching into Español (El Salvador, voseo) and saves
// it as a new Spanish draft linked to the English one. The English teaching is only read, never changed. The
// translation goes through the same Word exporter and importer as a hand translation, so it is checked by the
// importer's rules (labels, Scripture versions, length limits) before anything is saved.
export async function POST(request: Request) {
  const user = await getAuthorizedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return NextResponse.json({ error: "Translation is not set up yet. Add ANTHROPIC_API_KEY to the site's environment variables in Vercel, then redeploy." }, { status: 503 });

  const body = await request.json().catch(() => null);
  const teachingId = String(body?.teaching_id ?? "").trim();
  if (!UUID_PATTERN.test(teachingId)) return NextResponse.json({ error: "A valid teaching_id is required." }, { status: 400 });

  const supabase = await createClient();
  const { data: teaching, error } = await supabase
    .from("teachings")
    .select("id, title, central_theme, introduction, summary, teaser_1_heading, teaser_1_text, teaser_2_heading, teaser_2_text, teaching_type, language, gathering_date, status, translation_of")
    .eq("id", teachingId)
    .in("status", ["draft", "published"])
    .maybeSingle();
  if (error) return NextResponse.json({ error: "The teaching could not be read." }, { status: 500 });
  if (!teaching) return NextResponse.json({ error: "Teaching not found." }, { status: 404 });
  if (teaching.language === "es") return NextResponse.json({ error: "This teaching is already in Español. Only English teachings can be converted." }, { status: 400 });

  const { data: pointingAtIt } = await supabase.from("teachings").select("id, title").eq("translation_of", teachingId).limit(1);
  if (teaching.translation_of || (pointingAtIt ?? []).length) {
    return NextResponse.json({ error: "This teaching already has a Spanish version linked. Open that draft to edit it, or remove the link under Translation before converting again." }, { status: 409 });
  }

  const [{ data: categories, error: categoryError }, { data: sections, error: sectionError }] = await Promise.all([
    supabase.from("teaching_categories").select("id, title, sort_order").eq("teaching_id", teachingId).eq("status", teaching.status).order("sort_order", { ascending: true }),
    supabase.from("teaching_sections").select("id, category_id, title, content, sort_order").eq("teaching_id", teachingId).eq("status", teaching.status).order("sort_order", { ascending: true }),
  ]);
  if (categoryError || sectionError) return NextResponse.json({ error: "The teaching's content could not be read." }, { status: 500 });

  let translated: Awaited<ReturnType<typeof translateTeaching>>;
  try {
    translated = await translateTeaching(teaching as ExportTeaching, (categories ?? []) as ExportCategory[], (sections ?? []) as ExportSection[], {
      apiKey,
      model: process.env.ANTHROPIC_TRANSLATION_MODEL?.trim() || undefined,
    });
  } catch (translateError) {
    return NextResponse.json({ error: translateError instanceof Error ? translateError.message : "The translation failed. Nothing was saved." }, { status: 502 });
  }

  // Same path as a hand translation: write the Word file, then read it back with the Español importer rules.
  const file = buildTeachingTranslationDocx(translated.teaching, translated.categories, translated.sections);
  const parsed = parseTeachingDocx(file, { language: "es" });
  if (!parsed.ok || !parsed.teaching) {
    return NextResponse.json({ error: "The translation did not pass the import checks. Nothing was saved.", details: parsed.errors }, { status: 422 });
  }

  const created = await createDraftTeaching(supabase, parsed.teaching, {
    language: "es",
    gatheringDate: (teaching.gathering_date as string | null) ?? null,
    translationOf: teachingId,
  });
  if ("error" in created) return NextResponse.json({ error: created.error }, { status: 500 });

  revalidatePath("/admin/teachings");
  revalidatePath(`/admin/teachings/${teachingId}/edit`);

  return NextResponse.json({
    ok: true,
    id: created.id,
    title: parsed.teaching.title,
    editUrl: `/admin/teachings/${created.id}/edit`,
    warnings: [...parsed.warnings, ...translated.warnings],
    scriptures: translated.scriptures,
  });
}
