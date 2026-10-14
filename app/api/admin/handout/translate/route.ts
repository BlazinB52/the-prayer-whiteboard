import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { planHandoutTranslation } from "@/lib/handout-translate";
import { translateSegments } from "@/lib/teaching-auto-translate";
import type { HandoutBlock } from "@/lib/teaching-handouts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A handout is a few thousand characters, sent as one small request per section; it usually takes under a minute.
export const maxDuration = 300;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// "Translate to Español" on an English handout: translates its text into Español (El Salvador, voseo) following the
// Spanish Translation Rules and saves it as a new Español handout, linked to this one and to the same teaching, with the
// same teaching date. The English handout is only read, never changed. Administrator only.
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: isAdmin } = await supabase.rpc("is_authenticated_admin");
  if (!isAdmin) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return NextResponse.json({ error: "Translation is not set up yet. Add ANTHROPIC_API_KEY to the site's environment variables in Vercel, then redeploy." }, { status: 503 });

  const body = await request.json().catch(() => null);
  const handoutId = String(body?.handout_id ?? "").trim();
  if (!UUID_PATTERN.test(handoutId)) return NextResponse.json({ error: "A valid handout_id is required." }, { status: 400 });

  const { data: handout, error } = await supabase
    .from("teaching_handouts")
    .select("id, title, gathering_date, teaching_id, language, status, content, translation_of")
    .eq("id", handoutId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: "The handout could not be read." }, { status: 500 });
  if (!handout) return NextResponse.json({ error: "Handout not found." }, { status: 404 });
  if (handout.language === "es") return NextResponse.json({ error: "This handout is already in Español. Only English handouts can be translated." }, { status: 400 });
  const blocks = (Array.isArray(handout.content) ? handout.content : []) as HandoutBlock[];
  if (!blocks.length) return NextResponse.json({ error: "This handout has no draft text yet. Upload the draft first." }, { status: 400 });

  const { data: existing } = await supabase.from("teaching_handouts").select("id, title").eq("translation_of", handoutId).limit(1);
  if ((existing ?? []).length) {
    return NextResponse.json({ error: "This handout already has an Español version. Open it to edit, or delete it before translating again.", existingId: existing![0].id }, { status: 409 });
  }

  const plan = planHandoutTranslation(String(handout.title ?? ""), blocks);
  let translated: Awaited<ReturnType<typeof translateSegments>>;
  try {
    translated = await translateSegments(plan.groups, { apiKey, model: process.env.ANTHROPIC_TRANSLATION_MODEL?.trim() || undefined });
  } catch (translateError) {
    return NextResponse.json({ error: translateError instanceof Error ? translateError.message : "The translation failed. Nothing was saved." }, { status: 502 });
  }

  const built = plan.apply(translated.translated);
  const { data: created, error: insertError } = await supabase
    .from("teaching_handouts")
    .insert({
      title: built.title.slice(0, 200),
      gathering_date: handout.gathering_date,
      teaching_id: handout.teaching_id,
      language: "es",
      status: "draft",
      content: built.blocks,
      original_content: built.blocks,
      source_file_name: "Translated from the English handout",
      translation_of: handoutId,
    })
    .select("id")
    .single();
  if (insertError || !created) {
    return NextResponse.json({ error: "The Español handout could not be saved. Nothing was saved." }, { status: 500 });
  }

  revalidatePath("/admin/handouts");
  revalidatePath(`/admin/handouts/${handoutId}`);
  revalidatePath("/admin/cm/reports");

  return NextResponse.json({
    ok: true,
    id: created.id,
    title: built.title,
    editUrl: `/admin/handouts/${created.id}`,
    warnings: translated.warnings,
  });
}
