import { createClient } from "@supabase/supabase-js";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

const BUCKET = "chalkboards";

function createPublicClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

// A permanent URL for a published teaching's first chalkboard, for og:image.
// The storage bucket is private and signed URLs expire, which would break link
// previews that are cached for days, so the bytes are proxied from here instead.
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = createPublicClient();
  const signer = createServiceRoleClient();
  if (!slug || !supabase || !signer) return new Response("Not found", { status: 404 });

  const { data: teaching } = await supabase.from("teachings").select("id, chalkboard_asset_id").eq("slug", slug).eq("status", "published").maybeSingle();
  if (!teaching) return new Response("Not found", { status: 404 });

  const { data: assignments } = await supabase.from("teaching_chalkboard_assignments").select("chalkboard_asset_id").eq("teaching_id", teaching.id).order("display_order", { ascending: true });
  const candidateIds = [...(assignments ?? []).map((row) => row.chalkboard_asset_id as string), teaching.chalkboard_asset_id as string | null].filter((id): id is string => Boolean(id));

  for (const id of candidateIds) {
    const { data: asset } = await signer.from("chalkboard_assets").select("website_storage_path, storage_path").eq("id", id).eq("is_current_version", true).eq("status", "active").maybeSingle();
    for (const path of [asset?.website_storage_path, asset?.storage_path]) {
      if (!path) continue;
      const { data: file } = await signer.storage.from(BUCKET).download(path);
      if (!file) continue;
      return new Response(file, {
        headers: {
          "Content-Type": file.type || "image/png",
          "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
        },
      });
    }
  }
  return new Response("Not found", { status: 404 });
}
