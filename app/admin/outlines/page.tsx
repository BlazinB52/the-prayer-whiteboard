import type { Metadata } from "next";
import Link from "next/link";
import { requireContentManager } from "@/lib/supabase/admin";
import { staffHomePath } from "@/lib/staff-roles";
import { OUTLINE_BUCKET } from "@/lib/teaching-outlines";
import { OutlineManager, type ManagerCategory, type ManagerOutline, type ManagerTeaching } from "./outline-manager";

export const metadata: Metadata = {
  title: "Teaching Outlines",
  robots: { index: false, follow: false },
};

type OutlineRow = {
  id: string;
  title: string;
  subtitle: string | null;
  category_id: string;
  teaching_id: string | null;
  language: "en" | "es";
  gathering_date: string | null;
  status: "draft" | "published";
  source_path: string;
  source_file_name: string | null;
  created_at: string;
};

export default async function AdminOutlinesPage() {
  const { supabase, role } = await requireContentManager();

  const [categoriesResult, outlinesResult, teachingsResult] = await Promise.all([
    supabase.from("outline_categories").select("id, name, name_es").order("sort_order", { ascending: true }).order("name", { ascending: true }),
    supabase
      .from("teaching_outlines")
      .select("id, title, subtitle, category_id, teaching_id, language, gathering_date, status, source_path, source_file_name, created_at")
      .order("created_at", { ascending: false }),
    supabase.from("teachings").select("id, title, language").order("gathering_date", { ascending: false, nullsFirst: false }).order("title", { ascending: true }),
  ]);

  const categories = ((categoriesResult.data as { id: string; name: string; name_es: string | null }[] | null) ?? []).map((row): ManagerCategory => ({ id: row.id, name: row.name, nameEs: row.name_es }));
  const teachings = (teachingsResult.data as ManagerTeaching[] | null) ?? [];
  const outlines: ManagerOutline[] = ((outlinesResult.data as OutlineRow[] | null) ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    subtitle: row.subtitle,
    categoryId: row.category_id,
    teachingId: row.teaching_id,
    language: row.language,
    gatheringDate: row.gathering_date,
    status: row.status,
    createdAt: row.created_at,
    downloadHref: supabase.storage
      .from(OUTLINE_BUCKET)
      .getPublicUrl(row.source_path, { download: row.source_file_name ?? "outline.docx" }).data.publicUrl,
  }));
  const loadFailed = Boolean(categoriesResult.error || outlinesResult.error || teachingsResult.error);

  return (
    <main className="admin-shell">
      <div className="mx-auto max-w-6xl">
        <Link href={staffHomePath(role)} className="text-sm font-extrabold text-[#946332] hover:text-[#a85e32]">Back to dashboard</Link>
        <header className="mt-4 border-b border-[#284a3b]/10 pb-6">
          <h1 className="text-3xl font-extrabold tracking-tight text-[#243d31]">Teaching Outlines</h1>
          <p className="mt-2 text-sm text-[#607066]">Upload a teacher&apos;s outline as a Word file. It is converted automatically, filed under a category, and shown on the public Teacher Resources page when published.</p>
        </header>

        {loadFailed ? (
          <p role="alert" className="mt-6 text-sm font-bold text-[#a2472c]">
            Teaching outlines could not be loaded. If this is the first time using this tool, the database update for outlines may not be applied yet.
          </p>
        ) : (
          <OutlineManager categories={categories} outlines={outlines} teachings={teachings} />
        )}
      </div>
    </main>
  );
}
