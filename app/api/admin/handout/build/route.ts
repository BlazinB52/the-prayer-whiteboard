import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { publicationFileName, versionSlug } from "@/lib/file-names";
import { buildHandoutDocx, type TemplateDescriptor } from "@/lib/handout-docx/build";
import { createClient } from "@/lib/supabase/server";
import type { HandoutBlock } from "@/lib/teaching-handouts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CHALKBOARD_BUCKET = "chalkboards";
const DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const fail = (error: string, status: number, extra: Record<string, unknown> = {}) => NextResponse.json({ error, ...extra }, { status });

// "Build handout": fills the language's handout template with this handout's text, the whiteboard of the teaching (and the
// caption stored with it), and the handout's footer, and gives back the Word file named en_ or es_ + the teaching date.
// Administrator only. Nothing is saved; the file is made fresh each time.
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: isAdmin } = await supabase.rpc("is_authenticated_admin");
  if (!isAdmin) return fail("Unauthorized.", 401);

  const body = await request.json().catch(() => null);
  const handoutId = String(body?.handout_id ?? "").trim();
  const leaveCaptionBlank = body?.leave_caption_blank === true;
  if (!UUID_PATTERN.test(handoutId)) return fail("A valid handout_id is required.", 400);

  const { data: handout } = await supabase
    .from("teaching_handouts")
    .select("id, title, gathering_date, language, teaching_id, footer_id, content, version_label")
    .eq("id", handoutId)
    .maybeSingle();
  if (!handout) return fail("Handout not found.", 404);
  const language: "en" | "es" = handout.language === "es" ? "es" : "en";
  const blocks = (Array.isArray(handout.content) ? handout.content : []) as HandoutBlock[];
  if (!blocks.length) return fail("This handout has no draft text yet.", 400);
  if (!handout.gathering_date) return fail("Enter the teaching date and save the details first. The file is named from it.", 400);
  if (!handout.teaching_id) return fail("Choose the teaching this handout goes with, and save the details. The whiteboard comes from the teaching.", 400);
  if (!handout.footer_id) return fail("Choose a footer in the Handout footer box and save it.", 400);

  // The teaching whose whiteboard goes on the handout: the handout's own teaching, or for an Español handout the Español
  // teaching that was translated from it.
  let teachingId: string = handout.teaching_id;
  if (language === "es") {
    const { data: linked } = await supabase.from("teachings").select("id, language, translation_of").eq("id", handout.teaching_id).maybeSingle();
    if (linked?.language !== "es") {
      const { data: found } = await supabase.from("teachings").select("id").eq("translation_of", handout.teaching_id).eq("language", "es").limit(1);
      let spanishId: string | null = found?.[0]?.id ?? null;
      // The two teachings can also be linked the other way round, the English one pointing at its Español partner.
      if (!spanishId && linked?.translation_of) {
        const { data: partner } = await supabase.from("teachings").select("id").eq("id", linked.translation_of).eq("language", "es").maybeSingle();
        spanishId = partner?.id ?? null;
      }
      if (!spanishId) return fail("The Español handout's teaching has no Español version yet, so there is no Español whiteboard to use. Translate the teaching first.", 422);
      teachingId = spanishId;
    }
  }

  const [{ data: assignments }, { data: teaching }] = await Promise.all([
    supabase.from("teaching_chalkboard_assignments").select("chalkboard_asset_id, display_order").eq("teaching_id", teachingId).order("display_order", { ascending: true }),
    supabase.from("teachings").select("chalkboard_asset_id").eq("id", teachingId).maybeSingle(),
  ]);
  const assetIds = [...new Set([...(assignments ?? []).map((row) => row.chalkboard_asset_id as string), ...(teaching?.chalkboard_asset_id ? [teaching.chalkboard_asset_id as string] : [])])];
  if (!assetIds.length) return fail("The teaching has no whiteboard assigned. Choose one in the teaching's Chalkboards box.", 422);
  const { data: assets } = await supabase
    .from("chalkboard_assets")
    .select("id, canonical_name, title, language, caption, alt_text, download_storage_path, status, is_current_version")
    .in("id", assetIds)
    .eq("status", "active")
    .eq("is_current_version", true);
  const matching = assetIds.map((id) => (assets ?? []).find((asset) => asset.id === id && asset.language === language)).filter(Boolean);
  if (!matching.length) return fail(`The teaching has no ${language === "es" ? "Español" : "English"} whiteboard assigned. Choose one in the teaching's Chalkboards box.`, 422);
  const whiteboard = matching[0]!;
  if (!whiteboard.download_storage_path) return fail("The whiteboard has no full-size image stored.", 422);

  const { data: footer } = await supabase.from("content_footers").select("content, language, status").eq("id", handout.footer_id).maybeSingle();
  if (!footer || footer.status !== "active") return fail("The footer chosen for this handout is no longer available. Choose another.", 422);
  if (footer.language !== language) return fail(`Choose ${language === "es" ? "an Español" : "an English"} footer for this handout.`, 422);

  // The full-size whiteboard image (the same PNG the website offers for download).
  const { data: signed } = await supabase.storage.from(CHALKBOARD_BUCKET).createSignedUrl(whiteboard.download_storage_path, 120);
  if (!signed?.signedUrl) return fail("The whiteboard image could not be reached.", 502);
  let imageBytes: Buffer;
  try {
    const response = await fetch(signed.signedUrl, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error("download failed");
    imageBytes = Buffer.from(await response.arrayBuffer());
  } catch {
    return fail("The whiteboard image could not be downloaded. Try again.", 502);
  }

  let template: Buffer;
  let descriptor: TemplateDescriptor;
  try {
    const folder = path.join(process.cwd(), "assets", "handout-templates");
    template = await readFile(path.join(folder, `handout-${language}.docx`));
    descriptor = JSON.parse(await readFile(path.join(folder, `handout-${language}.json`), "utf8")) as TemplateDescriptor;
  } catch {
    return fail("The handout template could not be found on the server.", 500);
  }

  const result = buildHandoutDocx({
    language,
    template,
    descriptor,
    blocks,
    whiteboard: { bytes: imageBytes, caption: whiteboard.caption ?? null, altText: whiteboard.alt_text ?? null },
    leaveCaptionBlank,
    footerText: String(footer.content ?? ""),
  });
  if (matching.length > 1) result.report.warnings.push(`The teaching has ${matching.length} ${language === "es" ? "Español" : "English"} whiteboards; the first one, "${whiteboard.canonical_name ?? whiteboard.title}", was used.`);
  if (!result.ok) return fail("The handout could not be built.", 422, { details: result.errors, report: result.report });

  const fileName = publicationFileName(String(handout.gathering_date), language, handout.version_label ? `handout_${versionSlug(String(handout.version_label))}` : "handout", "docx");
  return new NextResponse(new Uint8Array(result.docx), {
    status: 200,
    headers: {
      "Content-Type": DOCX_TYPE,
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
      "X-Handout-File": fileName,
      "X-Handout-Report": encodeURIComponent(JSON.stringify(result.report)),
    },
  });
}
