import { NextResponse } from "next/server";
import { getAuthorizedUser } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { buildTeachingTranslationDocx, exportFileName, type ExportCategory, type ExportSection, type ExportTeaching } from "@/lib/teaching-docx-export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

// Downloads a teaching as a Word file for translation. It only reads: nothing about the teaching changes, it
// works on a draft or a published teaching, and it can be pressed as many times as needed.
export async function GET(request: Request) {
  const user = await getAuthorizedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const teachingId = new URL(request.url).searchParams.get("teaching_id")?.trim() ?? "";
  if (!UUID_PATTERN.test(teachingId)) return NextResponse.json({ error: "A valid teaching_id is required." }, { status: 400 });

  // The Administrator's own session, so every read is bounded by administrator access rules.
  const supabase = await createClient();
  const { data: teaching, error } = await supabase
    .from("teachings")
    .select("id, title, central_theme, introduction, summary, teaser_1_heading, teaser_1_text, teaser_2_heading, teaser_2_text, teaching_type, language, gathering_date, status")
    .eq("id", teachingId)
    .in("status", ["draft", "published"])
    .maybeSingle();
  if (error) return NextResponse.json({ error: "The teaching could not be read." }, { status: 500 });
  if (!teaching) return NextResponse.json({ error: "Teaching not found." }, { status: 404 });

  const [{ data: categories, error: categoryError }, { data: sections, error: sectionError }] = await Promise.all([
    supabase.from("teaching_categories").select("id, title, sort_order").eq("teaching_id", teachingId).eq("status", teaching.status).order("sort_order", { ascending: true }),
    supabase.from("teaching_sections").select("id, category_id, title, content, sort_order").eq("teaching_id", teachingId).eq("status", teaching.status).order("sort_order", { ascending: true }),
  ]);
  if (categoryError || sectionError) return NextResponse.json({ error: "The teaching's content could not be read." }, { status: 500 });

  const file = buildTeachingTranslationDocx(teaching as ExportTeaching, (categories ?? []) as ExportCategory[], (sections ?? []) as ExportSection[]);
  const fileName = exportFileName(teaching.gathering_date as string | null, teaching.language as string | null);

  return new NextResponse(new Uint8Array(file), {
    status: 200,
    headers: {
      "Content-Type": DOCX_TYPE,
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Content-Length": String(file.length),
      "Cache-Control": "no-store",
    },
  });
}
