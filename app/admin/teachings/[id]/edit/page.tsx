import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteTeaching, publishAndFeatureTeaching, unpublishTeaching, updateTeaching } from "../../actions";
import { TeachingForm } from "../../teaching-form";
import { ContentWorkspace } from "../../content-workspace";
import { DeleteTeachingButton } from "../../delete-teaching-button";
import { PublishFeatureButton } from "../../publish-feature-button";
import { UnpublishButton } from "../../unpublish-button";
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
    .in("status", ["draft", "published"])
    .maybeSingle();

  if (error || !teaching) {
    notFound();
  }

  const { data: categories } = await supabase
    .from("teaching_categories")
    .select("id, title, sort_order")
    .eq("teaching_id", id)
    .eq("status", teaching.status)
    .order("sort_order", { ascending: true });

  const { data: sections } = await supabase
    .from("teaching_sections")
    .select("id, category_id, title, content, sort_order, highlight_horizontal_alignment")
    .eq("teaching_id", id)
    .eq("status", teaching.status)
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
          <span className="rounded-full bg-[#e7efe9] px-3 py-1 text-[10px] font-black uppercase tracking-wider text-[#326048]">{teaching.status}</span>
        </div>
        <p className="mt-3 text-sm text-[#607066]">Update metadata and teaching content without changing publication or homepage-feature status.</p>
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
        <section className="mt-8 rounded-2xl border border-[#284a3b]/10 bg-[#fffdf8] p-5">
          <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#946332]">Devotional</p>
          <h2 className="mt-2 text-2xl font-extrabold text-[#243d31]">7-Day Devotional</h2>
          <p className="mt-3 text-sm leading-6 text-[#607066]">Create, edit, preview, publish, or unpublish the devotional without changing this teaching&apos;s publication or homepage-feature status.</p>
          <Link href={`/admin/teachings/${id}/devotional`} className="admin-secondary-button mt-4 inline-flex items-center justify-center">Manage 7-Day Devotional</Link>
        </section>
        <section className="mt-8 rounded-2xl border border-[#a85e32]/20 bg-[#fff8f1] p-5">
          <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#946332]">Publish</p>
          <h2 className="mt-2 text-2xl font-extrabold text-[#243d31]">Feature this teaching on the homepage</h2>
          <p className="mt-3 text-sm leading-6 text-[#607066]">Publishing makes this teaching public, replaces the current homepage feature without unpublishing it, and keeps the stored gathering date unchanged.</p>
          <PublishFeatureButton action={publishAndFeatureTeaching.bind(null, id)} />
        </section>
        {teaching.status === "published" ? (
          <section className="mt-8 rounded-2xl border border-[#a2472c]/20 bg-[#fff8f1] p-5">
            <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#946332]">Unpublish</p>
            <h2 className="mt-2 text-2xl font-extrabold text-[#243d31]">Return this teaching to draft</h2>
            <p className="mt-3 text-sm leading-6 text-[#607066]">Unpublishing removes this teaching from public pages and returns its categories and sections to draft.</p>
            <UnpublishButton action={unpublishTeaching.bind(null, id)} />
          </section>
        ) : null}
        <ContentWorkspace
          teachingId={id}
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
        <section className="mt-8 rounded-2xl border border-[#a2472c]/30 bg-[#fff3ed] p-5">
          <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#a2472c]">Danger zone</p>
          <h2 className="mt-2 text-2xl font-extrabold text-[#5d2b1f]">Delete teaching</h2>
          <DeleteTeachingButton action={deleteTeaching.bind(null, id)} />
        </section>
      </div>
    </main>
  );
}
