import { NextResponse } from "next/server";
import { buildDevotionalTranslationText, devotionalExportFileName, type ExportDevotional, type ExportDevotionalDay } from "@/lib/devotional-export";
import { getAuthorizedUser } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Downloads a devotional as a text file for translation. It only reads: nothing about the devotional changes,
// it works on a draft or a published devotional, and it can be pressed as many times as needed.
export async function GET(request: Request) {
  const user = await getAuthorizedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const devotionalId = new URL(request.url).searchParams.get("devotional_id")?.trim() ?? "";
  if (!UUID_PATTERN.test(devotionalId)) return NextResponse.json({ error: "A valid devotional_id is required." }, { status: 400 });

  const supabase = await createClient();
  const { data: devotional, error } = await supabase.from("teaching_devotionals").select("id, title, introduction, teaching_id").eq("id", devotionalId).maybeSingle();
  if (error) return NextResponse.json({ error: "The devotional could not be read." }, { status: 500 });
  if (!devotional) return NextResponse.json({ error: "Devotional not found." }, { status: 404 });

  const { data: days, error: daysError } = await supabase
    .from("teaching_devotional_days")
    .select("day_number, title, anchor_scriptures, devotional_reading, confession, journal_prompt, prayer_activation, bread_reflection, cup_reflection, self_examination, series_closing_prayer")
    .eq("devotional_id", devotionalId)
    .order("day_number", { ascending: true });
  if (daysError) return NextResponse.json({ error: "The devotional's days could not be read." }, { status: 500 });

  // The file is dated like the teaching it goes with, when there is one; otherwise with today's date.
  const { data: assignment } = await supabase.from("teaching_devotional_assignments").select("teaching_id").eq("devotional_id", devotionalId).limit(1).maybeSingle();
  const teachingId = (assignment?.teaching_id as string | undefined) ?? (devotional.teaching_id as string | null);
  const { data: teaching } = teachingId ? await supabase.from("teachings").select("gathering_date").eq("id", teachingId).maybeSingle() : { data: null };

  const text = buildDevotionalTranslationText(devotional as ExportDevotional, (days ?? []) as ExportDevotionalDay[]);
  const fileName = devotionalExportFileName((teaching?.gathering_date as string | null | undefined) ?? null);

  return new NextResponse(text, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
