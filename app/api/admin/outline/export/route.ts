import { NextResponse } from "next/server";
import { buildOutlineDocx } from "@/lib/outline-docx";
import { createClient } from "@/lib/supabase/server";
import { outlineSlug, validateOutlineId, type OutlineBlock } from "@/lib/teaching-outlines";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

// "Export for editing": the outline as a styled Word file the Administrator can edit and import back. The file carries a marker
// naming this outline and a fingerprint of its text, which the import checks. Administrator only. Nothing is saved.
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: isAdmin } = await supabase.rpc("is_authenticated_admin");
  if (!isAdmin) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const id = validateOutlineId(new URL(request.url).searchParams.get("id"));
  if (!id.value) return NextResponse.json({ error: "A valid outline id is required." }, { status: 400 });

  const { data: outline } = await supabase.from("teaching_outlines").select("id, title, subtitle, language, gathering_date, content").eq("id", id.value).maybeSingle();
  if (!outline) return NextResponse.json({ error: "Outline not found." }, { status: 404 });
  const { data: hash, error } = await supabase.rpc("outline_content_hash", { p_outline_id: id.value });
  if (error || typeof hash !== "string") return NextResponse.json({ error: "The outline could not be fingerprinted." }, { status: 500 });

  const file = buildOutlineDocx({
    outlineId: outline.id,
    hash,
    title: outline.title,
    subtitle: outline.subtitle,
    blocks: (Array.isArray(outline.content) ? outline.content : []) as OutlineBlock[],
  });
  const date = typeof outline.gathering_date === "string" ? outline.gathering_date.replace(/-/g, "") : "";
  const name = `${date ? `${date}_` : ""}${outline.language === "es" ? "es" : "en"}_${outlineSlug(outline.title)}_for-editing.docx`;
  return new NextResponse(new Uint8Array(file), {
    headers: {
      "Content-Type": DOCX_TYPE,
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}
