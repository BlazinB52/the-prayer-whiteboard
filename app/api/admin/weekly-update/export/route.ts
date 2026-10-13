import { NextResponse } from "next/server";
import { getAuthorizedUser } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { WeeklyUpdateBlock } from "@/lib/weekly-update-docx";
import { buildWeeklyUpdateTranslationDocx, weeklyUpdateExportFileName } from "@/lib/weekly-update-export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

// Downloads a weekly update as a Word file for translation. It only reads: nothing about the update changes, it
// works on a draft, a published or an archived update, and it can be pressed as many times as needed.
export async function GET(request: Request) {
  const user = await getAuthorizedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const id = new URL(request.url).searchParams.get("weekly_update_id")?.trim() ?? "";
  if (!UUID_PATTERN.test(id)) return NextResponse.json({ error: "A valid weekly_update_id is required." }, { status: 400 });

  const supabase = await createClient();
  const { data: update, error } = await supabase.from("weekly_updates").select("id, title, converted_content, published_at, created_at").eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ error: "The weekly update could not be read." }, { status: 500 });
  if (!update) return NextResponse.json({ error: "Weekly update not found." }, { status: 404 });

  const blocks = (Array.isArray(update.converted_content) ? update.converted_content : []) as WeeklyUpdateBlock[];
  const file = buildWeeklyUpdateTranslationDocx(String(update.title ?? ""), blocks);
  const fileName = weeklyUpdateExportFileName(((update.published_at as string | null) ?? (update.created_at as string | null) ?? null));

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
