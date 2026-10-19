import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createDraftDevotional } from "@/lib/devotional-create";
import type { ExportDevotional, ExportDevotionalDay } from "@/lib/devotional-export";
import { translateDevotional } from "@/lib/devotional-translate";
import { getAuthorizedUser } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Each day is translated as its own request, several at a time; a whole devotional takes a minute or two.
export const maxDuration = 300;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// "Translate to Español" on an English devotional: translates it into Español (El Salvador, voseo) following the
// Spanish Translation Rules, replaces each anchor Scripture with the published RVR1960 text, and saves it as a new
// Español draft linked to this one. The English devotional is only read, never changed. Administrator only.
// The export-for-translation text file and the Create From a Text File page still work as the manual way.
export async function POST(request: Request) {
  const user = await getAuthorizedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return NextResponse.json({ error: "Translation is not set up yet. Add ANTHROPIC_API_KEY to the site's environment variables in Vercel, then redeploy." }, { status: 503 });

  const body = await request.json().catch(() => null);
  const devotionalId = String(body?.devotional_id ?? "").trim();
  if (!UUID_PATTERN.test(devotionalId)) return NextResponse.json({ error: "A valid devotional_id is required." }, { status: 400 });

  const supabase = await createClient();
  const { data: devotional, error } = await supabase
    .from("teaching_devotionals")
    .select("id, title, introduction, language, translation_of, gathering_date, teaching_id")
    .eq("id", devotionalId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: "The devotional could not be read." }, { status: 500 });
  if (!devotional) return NextResponse.json({ error: "Devotional not found." }, { status: 404 });
  if (devotional.language === "es") return NextResponse.json({ error: "This devotional is already in Español. Only English devotionals can be translated." }, { status: 400 });

  const { data: pointingAtIt } = await supabase.from("teaching_devotionals").select("id").eq("translation_of", devotionalId).limit(1);
  if (devotional.translation_of || (pointingAtIt ?? []).length) {
    return NextResponse.json({ error: "This devotional already has an Español version linked. Open that draft to edit it, or remove the link under Translation before translating again.", existingId: pointingAtIt?.[0]?.id ?? null }, { status: 409 });
  }

  const { data: days, error: daysError } = await supabase
    .from("teaching_devotional_days")
    .select("day_number, title, anchor_scriptures, devotional_reading, confession, journal_prompt, prayer_activation, bread_reflection, cup_reflection, self_examination, series_closing_prayer")
    .eq("devotional_id", devotionalId)
    .order("day_number", { ascending: true });
  if (daysError) return NextResponse.json({ error: "The devotional's days could not be read." }, { status: 500 });

  let translated: Awaited<ReturnType<typeof translateDevotional>>;
  try {
    translated = await translateDevotional(devotional as ExportDevotional, (days ?? []) as ExportDevotionalDay[], {
      apiKey,
      model: process.env.ANTHROPIC_TRANSLATION_MODEL?.trim() || undefined,
    });
  } catch (translateError) {
    return NextResponse.json({ error: translateError instanceof Error ? translateError.message : "The translation failed. Nothing was saved." }, { status: 502 });
  }

  // The Español draft carries the same teaching date: the devotional's own, else its teaching's.
  let gatheringDate = (devotional.gathering_date as string | null) ?? null;
  if (!gatheringDate) {
    const { data: assignment } = await supabase.from("teaching_devotional_assignments").select("teaching_id").eq("devotional_id", devotionalId).limit(1).maybeSingle();
    const teachingId = (assignment?.teaching_id as string | undefined) ?? (devotional.teaching_id as string | null);
    const { data: teaching } = teachingId ? await supabase.from("teachings").select("gathering_date").eq("id", teachingId).maybeSingle() : { data: null };
    gatheringDate = (teaching?.gathering_date as string | null | undefined) ?? null;
  }

  const created = await createDraftDevotional(supabase, translated.imported, { language: "es", translationOf: devotionalId, gatheringDate });
  if ("error" in created) return NextResponse.json({ error: created.error }, { status: 500 });

  revalidatePath("/admin/devotionals");
  revalidatePath(`/admin/devotionals/${devotionalId}`);
  revalidatePath(`/admin/devotionals/${created.id}`);

  return NextResponse.json({
    ok: true,
    id: created.id,
    title: translated.imported.title,
    editUrl: `/admin/devotionals/${created.id}`,
    warnings: translated.warnings,
    scriptures: translated.scriptures,
  });
}
