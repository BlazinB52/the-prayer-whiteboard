import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { translateSegments } from "@/lib/teaching-auto-translate";
import { weeklyUpdatePlainText, type WeeklyUpdateBlock } from "@/lib/weekly-update-docx";
import { planWeeklyUpdateTranslation } from "@/lib/weekly-update-translate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A weekly update is a few thousand characters, sent as a handful of small requests; it usually takes under a minute.
export const maxDuration = 300;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// "Translate to Español" on an English weekly update: translates its text into Español (El Salvador, voseo) following the
// Spanish Translation Rules and saves it as a new Español DRAFT, linked to this one, with the same gathering date and
// teaching. The Español whiteboard of the same date and the footer last used on an Español update are chosen for it. Nothing
// is published and nothing is emailed. The English update is only read, never changed. Administrator only.
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: isAdmin } = await supabase.rpc("is_authenticated_admin");
  if (!isAdmin) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return NextResponse.json({ error: "Translation is not set up yet. Add ANTHROPIC_API_KEY to the site's environment variables in Vercel, then redeploy." }, { status: 503 });

  const body = await request.json().catch(() => null);
  const updateId = String(body?.weekly_update_id ?? "").trim();
  if (!UUID_PATTERN.test(updateId)) return NextResponse.json({ error: "A valid weekly_update_id is required." }, { status: 400 });

  const { data: update, error } = await supabase
    .from("weekly_updates")
    .select("id, title, language, status, converted_content, gathering_date, teaching_id, recorded_sent_on, chalkboard_asset_id")
    .eq("id", updateId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: "The weekly update could not be read." }, { status: 500 });
  if (!update) return NextResponse.json({ error: "Weekly update not found." }, { status: 404 });
  if (update.language === "es") return NextResponse.json({ error: "This weekly update is already in Español. Only English weekly updates can be translated." }, { status: 400 });
  if (update.recorded_sent_on) return NextResponse.json({ error: "This is a record of a letter that was sent. Its text is not stored here, so there is nothing to translate." }, { status: 400 });
  const blocks = (Array.isArray(update.converted_content) ? update.converted_content : []) as WeeklyUpdateBlock[];
  if (!blocks.length) return NextResponse.json({ error: "This weekly update has no text to translate." }, { status: 400 });

  const { data: existing } = await supabase.from("weekly_updates").select("id").eq("translation_of", updateId).limit(1);
  if ((existing ?? []).length) {
    return NextResponse.json({ error: "This weekly update already has an Español version. Open it to edit, or delete it before translating again.", existingId: existing![0].id }, { status: 409 });
  }

  const plan = planWeeklyUpdateTranslation(String(update.title ?? ""), blocks);
  let translated: Awaited<ReturnType<typeof translateSegments>>;
  try {
    translated = await translateSegments(plan.groups, { apiKey, model: process.env.ANTHROPIC_TRANSLATION_MODEL?.trim() || undefined });
  } catch (translateError) {
    return NextResponse.json({ error: translateError instanceof Error ? translateError.message : "The translation failed. Nothing was saved." }, { status: 502 });
  }

  const built = plan.apply(translated.translated);

  // The Español whiteboard of the same date as each English one, and the footer last used on an Español update.
  const notes: string[] = [];
  const { data: englishBoards } = await supabase.from("weekly_update_chalkboard_assignments").select("chalkboard_asset_id, display_order").eq("weekly_update_id", updateId).order("display_order", { ascending: true });
  const englishBoardIds = [...new Set([...(englishBoards ?? []).map((row) => row.chalkboard_asset_id as string), ...(update.chalkboard_asset_id ? [update.chalkboard_asset_id as string] : [])])];
  let boardIds: string[] = [];
  if (englishBoardIds.length) {
    const { data: englishAssets } = await supabase.from("chalkboard_assets").select("id, chalkboard_date").in("id", englishBoardIds);
    const dates = [...new Set((englishAssets ?? []).map((asset) => asset.chalkboard_date as string | null).filter((date): date is string => Boolean(date)))];
    if (dates.length) {
      const { data: spanishAssets } = await supabase.from("chalkboard_assets").select("id").eq("language", "es").eq("status", "active").eq("is_current_version", true).in("chalkboard_date", dates).order("chalkboard_date", { ascending: false });
      boardIds = (spanishAssets ?? []).map((asset) => asset.id as string);
    }
    if (!boardIds.length) notes.push("No Español whiteboard of the same date was found. Choose one on the Español update.");
  }
  let footerId: string | null = null;
  {
    const { data: spanishUpdates } = await supabase.from("weekly_updates").select("id").eq("language", "es").order("created_at", { ascending: false }).limit(20);
    const ids = (spanishUpdates ?? []).map((row) => row.id as string);
    if (ids.length) {
      const { data: assignments } = await supabase.from("weekly_update_footer_assignments").select("weekly_update_id, footer_id").in("weekly_update_id", ids);
      const byUpdate = new Map((assignments ?? []).map((row) => [row.weekly_update_id as string, row.footer_id as string]));
      const candidate = ids.map((id) => byUpdate.get(id)).find(Boolean);
      if (candidate) {
        const { data: footer } = await supabase.from("content_footers").select("id").eq("id", candidate).eq("language", "es").eq("status", "active").maybeSingle();
        footerId = footer?.id ?? null;
      }
    }
    if (!footerId) notes.push("No Español footer was chosen. Pick one on the Español update.");
  }

  const { data: created, error: insertError } = await supabase
    .from("weekly_updates")
    .insert({
      title: built.title.slice(0, 180),
      body_markdown: weeklyUpdatePlainText(built.blocks),
      converted_content: built.blocks,
      source_document_file_name: "Translated from the English weekly update",
      chalkboard_asset_id: boardIds[0] ?? null,
      gathering_date: update.gathering_date,
      teaching_id: update.teaching_id,
      language: "es",
      status: "draft",
      is_current: false,
      translation_of: updateId,
    })
    .select("id")
    .single();
  if (insertError || !created) {
    return NextResponse.json({ error: "The Español weekly update could not be saved. Nothing was saved." }, { status: 500 });
  }

  if (boardIds.length) {
    await supabase.from("weekly_update_chalkboard_assignments").insert(boardIds.map((chalkboard_asset_id, index) => ({ weekly_update_id: created.id, chalkboard_asset_id, display_order: index + 1 })));
  }
  if (footerId) await supabase.from("weekly_update_footer_assignments").insert({ weekly_update_id: created.id, footer_id: footerId });

  revalidatePath("/admin/weekly-updates");
  revalidatePath("/admin/cm/reports/title-collections");

  return NextResponse.json({
    ok: true,
    id: created.id,
    title: built.title,
    warnings: [...notes, ...translated.warnings],
  });
}
