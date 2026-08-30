import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { updateTeaching } from "../../actions";
import { TeachingForm } from "../../teaching-form";
import { ContentWorkspace } from "../../content-workspace";
import {
  createCategory,
  createSection,
  deleteCategory,
  deleteSection,
  moveCategory,
  moveSection,
  renameCategory,
  updateSection,
} from "../../content-actions";
import { requireAdmin } from "@/lib/supabase/admin";

export const metadata: Metadata = {
  title: "Edit Teaching Draft",
  robots: { index: false, follow: false },
};

export default async function EditTeachingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    notFound();
  }

  const { supabase } = await requireAdmin();
  const { data: teaching, error } = await supabase
    .from("teachings")
    .select("id, title, gathering_date, central_theme, introduction, summary, status")
    .eq("id", id)
    .eq("status", "draft")
    .maybeSingle();

  if (error || !teaching) {
    notFound();
  }

  const { data: categories } = await supabase
    .from("teaching_categories")
    .select("id, title, sort_order")
    .eq("teaching_id", id)
    .eq("status", "draft")
    .order("sort_order", { ascending: true });

  const { data: sections } = await supabase
    .from("teaching_sections")
    .select("id, category_id, title, content, sort_order")
    .eq("teaching_id", id)
    .eq("status", "draft")
    .order("sort_order", { ascending: true });

  const categoryItems = (categories ?? []).map((category) => ({
    ...category,
    sections: (sections ?? []).filter((section) => section.category_id === category.id),
  }));

  const renameCategoryActions = Object.fromEntries(
    categoryItems.map((category) => [category.id, renameCategory.bind(null, id, category.id)]),
  );
  const createSectionActions = Object.fromEntries(
    categoryItems.map((category) => [category.id, createSection.bind(null, id, category.id)]),
  );
  const moveCategoryActions = Object.fromEntries(
    categoryItems.map((category) => [
      category.id,
      {
        up: moveCategory.bind(null, id, category.id, "up"),
        down: moveCategory.bind(null, id, category.id, "down"),
      },
    ]),
  );
  const deleteCategoryActions = Object.fromEntries(
    categoryItems.map((category) => [category.id, deleteCategory.bind(null, id, category.id)]),
  );
  const updateSectionActions = Object.fromEntries(
    categoryItems.flatMap((category) =>
      category.sections.map((section) => [
        section.id,
        updateSection.bind(null, id, category.id, section.id),
      ]),
    ),
  );
  const moveSectionActions = Object.fromEntries(
    categoryItems.flatMap((category) =>
      category.sections.map((section) => [
        section.id,
        {
          up: moveSection.bind(null, id, category.id, section.id, "up"),
          down: moveSection.bind(null, id, category.id, section.id, "down"),
        },
      ]),
    ),
  );
  const deleteSectionActions = Object.fromEntries(
    categoryItems.flatMap((category) =>
      category.sections.map((section) => [
        section.id,
        deleteSection.bind(null, id, category.id, section.id),
      ]),
    ),
  );

  return (
    <main className="admin-shell">
      <div className="mx-auto max-w-3xl">
        <Link href="/admin/teachings" className="text-sm font-extrabold text-[#946332] hover:text-[#a85e32]">Back to Teachings</Link>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-4xl font-extrabold tracking-tight text-[#243d31]">Edit Teaching</h1>
          <span className="rounded-full bg-[#e7efe9] px-3 py-1 text-[10px] font-black uppercase tracking-wider text-[#326048]">Draft</span>
        </div>
        <p className="mt-3 text-sm text-[#607066]">Update metadata only. Publishing, featuring, archiving, and deleting are unavailable in this phase.</p>
        <TeachingForm
          action={updateTeaching.bind(null, id)}
          values={{
            title: teaching.title,
            gatheringDate: teaching.gathering_date ?? "",
            centralTheme: teaching.central_theme ?? "",
            introduction: teaching.introduction ?? "",
            summary: teaching.summary ?? "",
          }}
        />
        <ContentWorkspace
          categories={categoryItems}
          createCategoryAction={createCategory.bind(null, id)}
          renameCategoryAction={renameCategoryActions}
          createSectionActions={createSectionActions}
          updateSectionActions={updateSectionActions}
          moveCategoryActions={moveCategoryActions}
          deleteCategoryActions={deleteCategoryActions}
          moveSectionActions={moveSectionActions}
          deleteSectionActions={deleteSectionActions}
        />
      </div>
    </main>
  );
}
