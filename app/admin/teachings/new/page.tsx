import type { Metadata } from "next";
import Link from "next/link";
import { createTeaching } from "../actions";
import { TeachingForm } from "../teaching-form";
import { requireAdmin } from "@/lib/supabase/admin";

export const metadata: Metadata = {
  title: "New Teaching",
  robots: { index: false, follow: false },
};

export default async function NewTeachingPage() {
  const { supabase } = await requireAdmin();
  const [{ data: chalkboards }, { data: footers }] = await Promise.all([
    supabase
      .from("chalkboard_assets")
      .select("id, title, canonical_name, chalkboard_date")
      .eq("is_current_version", true)
      .eq("status", "active")
      .order("chalkboard_date", { ascending: false })
      .order("canonical_name", { ascending: true }),
    supabase.from("content_footers").select("id, internal_title").eq("status", "active").order("internal_title", { ascending: true }),
  ]);
  const chalkboardOptions = (chalkboards ?? []).map((chalkboard) => ({
    id: chalkboard.id,
    label: chalkboard.canonical_name ?? chalkboard.title,
  }));
  const footerOptions = (footers ?? []).map((footer) => ({ id: footer.id, label: footer.internal_title }));

  return (
    <main className="admin-shell">
      <div className="mx-auto max-w-3xl">
        <Link href="/admin/teachings" className="text-sm font-extrabold text-[#946332] hover:text-[#a85e32]">Back to Teachings</Link>
        <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-[#243d31]">New Teaching</h1>
        <p className="mt-3 text-sm text-[#607066]">Start with private draft metadata. Publishing and content structure will come later.</p>
        <TeachingForm action={createTeaching} values={{ title: "", gatheringDate: "", centralTheme: "", introduction: "", summary: "", teaser1Heading: "", teaser1Text: "", teaser2Heading: "", teaser2Text: "", chalkboardAssetIds: [], includeFooter: false, footerId: "" }} chalkboards={chalkboardOptions} footers={footerOptions} />
      </div>
    </main>
  );
}
