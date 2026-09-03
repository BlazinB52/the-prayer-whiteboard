import { createClient } from "@supabase/supabase-js";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BUCKET = "chalkboards";

function createPublicClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function safeFileName(value: string) {
  const normalized = value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase();
  return `${normalized || "chalkboard"}.jpg`;
}

export async function GET(request: Request, { params }: { params: Promise<{ slug: string; assetId: string }> }) {
  const { slug, assetId } = await params;
  if (!slug || !UUID_PATTERN.test(assetId)) return new Response("Not found", { status: 404 });

  const supabase = createPublicClient();
  const signer = createServiceRoleClient();
  if (!supabase || !signer) return new Response("Download unavailable", { status: 503 });

  const { data: teaching } = await supabase.from("teachings").select("id, title").eq("slug", slug).eq("status", "published").maybeSingle();
  if (!teaching) return new Response("Not found", { status: 404 });

  const { data: asset } = await signer
    .from("chalkboard_assets")
    .select("id, teaching_id, download_storage_path, allow_download, is_current_version, status")
    .eq("id", assetId)
    .eq("teaching_id", teaching.id)
    .eq("is_current_version", true)
    .eq("status", "active")
    .maybeSingle();
  if (!asset || asset.teaching_id !== teaching.id || !asset.allow_download || !asset.download_storage_path) return new Response("Not found", { status: 404 });

  const { data: file, error } = await signer.storage.from(BUCKET).download(asset.download_storage_path);
  if (error || !file) return new Response("Not found", { status: 404 });

  return new Response(file, {
    headers: {
      "Cache-Control": "private, max-age=300",
      "Content-Type": "image/jpeg",
      "Content-Disposition": `attachment; filename="${safeFileName(teaching.title)}-chalkboard.jpg"`,
    },
  });
}
