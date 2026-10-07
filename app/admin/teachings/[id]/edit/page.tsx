import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteTeaching, publishAndFeatureTeaching, setTeachingReady, unpublishTeaching, updateTeaching } from "../../actions";
import { TeachingForm } from "../../teaching-form";
import { ContentWorkspace } from "../../content-workspace";
import { DeleteTeachingButton } from "../../delete-teaching-button";
import { PublishFeatureButton } from "../../publish-feature-button";
import { UnpublishButton } from "../../unpublish-button";
import { TeachingTestSendForm } from "../../test-send-form";
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
import { getPublishEmailInfo } from "@/lib/publish-email-info";
import { publishEmailNotice } from "@/lib/publish-email-notice";

export const metadata: Metadata = {
  title: "Edit Teaching Draft",
  robots: { index: false, follow: false },
};

function formatDate(value: string | null) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}

export default async function EditTeachingPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ready?: string }> }) {
  const [{ id }, flags] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    notFound();
  }

  const { supabase } = await requireAdmin();
  const { data: teaching, error } = await supabase
    .from("teachings")
    .select("id, slug, title, is_featured, ready_to_publish_at, updated_at, teaching_type, language, gathering_date, central_theme, introduction, summary, teaser_1_heading, teaser_1_text, teaser_2_heading, teaser_2_text, status, chalkboard_asset_id")
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

  const [{ data: chalkboards }, { data: assignedChalkboards }, { data: footers }, { data: footerAssignment }] = await Promise.all([
    supabase
      .from("chalkboard_assets")
      .select("id, title, canonical_name, language, chalkboard_date")
      .eq("is_current_version", true)
      .eq("status", "active")
      .order("chalkboard_date", { ascending: false })
      .order("canonical_name", { ascending: true }),
    supabase.from("teaching_chalkboard_assignments").select("chalkboard_asset_id").eq("teaching_id", id).order("display_order", { ascending: true }),
    supabase.from("content_footers").select("id, internal_title, language").eq("status", "active").order("internal_title", { ascending: true }),
    supabase.from("teaching_footer_assignments").select("footer_id").eq("teaching_id", id).maybeSingle(),
  ]);
  const assignedChalkboardIds = (assignedChalkboards ?? []).map((assignment) => assignment.chalkboard_asset_id as string);
  const chalkboardOptions = (chalkboards ?? []).map((chalkboard) => ({
    id: chalkboard.id,
    label: chalkboard.canonical_name ?? chalkboard.title,
    language: (chalkboard.language === "es" ? "es" : "en") as "en" | "es",
  }));
  // The devotional attached to this teaching, if any, shown in the Devotional section below.
  const { data: devotionalAssignment } = await supabase.from("teaching_devotional_assignments").select("devotional_id").eq("teaching_id", id).maybeSingle();
  const { data: assignedDevotional } = devotionalAssignment
    ? await supabase.from("teaching_devotionals").select("id, title, status").eq("id", devotionalAssignment.devotional_id).maybeSingle()
    : { data: null };
  // Co-editor proposals still waiting on a decision. Publishing closes them (and deletes their text),
  // so say so here instead of letting it come as a surprise.
  const { count: pendingRevisionCount } = teaching.status === "draft"
    ? await supabase.from("content_revisions").select("id", { count: "exact", head: true }).eq("teaching_id", id).eq("status", "submitted")
    : { count: 0 };
  // What publishing would email, shown before the Administrator presses Publish.
  const publishNotice = publishEmailNotice(await getPublishEmailInfo(supabase, id, teaching.language === "es" ? "es" : "en"));
  const footerOptions = (footers ?? []).map((footer) => ({ id: footer.id, label: footer.internal_title, language: (footer.language === "es" ? "es" : "en") as "en" | "es" }));

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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/admin/teachings" className="text-sm font-extrabold text-[#946332] hover:text-[#a85e32]">Back to Teachings</Link>
          <a href="#delete-teaching" className="text-sm font-extrabold text-[#a2472c] hover:underline">Delete this teaching</a>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-4xl font-extrabold tracking-tight text-[#243d31]">Edit Teaching</h1>
          <span className="rounded-full bg-[#e7efe9] px-3 py-1 text-[10px] font-black uppercase tracking-wider text-[#326048]">{teaching.status}</span>
        </div>
        <p className="mt-3 text-sm text-[#607066]">Update metadata and teaching content without changing publication or homepage-feature status.</p>
        <section className="mt-6 rounded-2xl border border-[#284a3b]/10 bg-[#fffdf8] p-5">
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-[#e7efe9] px-3 py-1 text-[10px] font-black uppercase tracking-wider text-[#326048]">{teaching.language === "es" ? "Español" : "English"}</span>
            {teaching.teaching_type === "deep_dive" ? <span className="rounded-full bg-[#20382e] px-3 py-1 text-[10px] font-black uppercase tracking-wider text-[#f0cb83]">Deep Dive</span> : null}
          </div>
          <dl className="mt-4 grid gap-3 text-sm text-[#607066] sm:grid-cols-3">
            <div><dt>Gathering date</dt><dd className="font-bold text-[#385245]">{formatDate(teaching.gathering_date)}</dd></div>
            <div><dt>Featured</dt><dd className="font-bold text-[#385245]">{teaching.is_featured ? "Yes" : "No"}</dd></div>
            <div><dt>Last updated</dt><dd className="font-bold text-[#385245]">{new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(teaching.updated_at))}</dd></div>
          </dl>
          {teaching.status === "published" ? <Link href={`/teachings/${teaching.slug}`} className="mt-4 inline-flex font-extrabold text-[#9d5a2f] hover:text-[#a85e32]">View public teaching</Link> : null}
          <details className="mt-4">
            <summary className="cursor-pointer text-sm font-extrabold text-[#9d5a2f]">Send a test email</summary>
            <div className="mt-4"><TeachingTestSendForm teachingId={id} /></div>
          </details>
        </section>
        <TeachingForm
          action={updateTeaching.bind(null, id)}
          values={{
            title: teaching.title,
            teachingType: teaching.teaching_type === "deep_dive" ? "deep_dive" : "standard",
            language: teaching.language === "es" ? "es" : "en",
            gatheringDate: teaching.gathering_date ?? "",
            centralTheme: teaching.central_theme ?? "",
            introduction: teaching.introduction ?? "",
            summary: teaching.summary ?? "",
            teaser1Heading: teaching.teaser_1_heading ?? "",
            teaser1Text: teaching.teaser_1_text ?? "",
            teaser2Heading: teaching.teaser_2_heading ?? "",
            teaser2Text: teaching.teaser_2_text ?? "",
            chalkboardAssetIds: assignedChalkboardIds.length ? assignedChalkboardIds : (teaching.chalkboard_asset_id ? [teaching.chalkboard_asset_id] : []),
            includeFooter: Boolean(footerAssignment?.footer_id),
            footerId: footerAssignment?.footer_id ?? "",
          }}
          chalkboards={chalkboardOptions}
          footers={footerOptions}
        />
        <section className="mt-8 rounded-2xl border border-[#284a3b]/10 bg-[#fffdf8] p-5">
          <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#946332]">Devotional</p>
          <h2 className="mt-2 text-2xl font-extrabold text-[#243d31]">7-Day Devotional</h2>
          {assignedDevotional ? (
            <p className="mt-3 text-sm text-[#607066]">
              Attached devotional: <Link href={`/admin/devotionals/${assignedDevotional.id}`} className="font-extrabold text-[#243d31] underline underline-offset-2">{assignedDevotional.title}</Link>{" "}
              <span className="ml-1 rounded-full bg-[#e7efe9] px-3 py-1 text-[10px] font-black uppercase tracking-wider text-[#326048]">{assignedDevotional.status}</span>
            </p>
          ) : (
            <p className="mt-3 text-sm text-[#607066]">No devotional is attached to this teaching.</p>
          )}
          <p className="mt-3 text-sm leading-6 text-[#607066]">Create, edit, preview, publish, or unpublish the devotional without changing this teaching&apos;s publication or homepage-feature status.</p>
          <Link href={`/admin/teachings/${id}/devotional`} className="admin-secondary-button mt-4 inline-flex items-center justify-center">Manage 7-Day Devotional</Link>
        </section>
        {pendingRevisionCount ? (
          <p role="status" className="mt-8 rounded-xl border border-[#1a4fb4]/20 bg-[#e8f0fe] px-4 py-3 text-sm font-bold leading-6 text-[#1a3f8a]">
            {pendingRevisionCount} co-editor {pendingRevisionCount === 1 ? "revision is" : "revisions are"} waiting for your review. Publishing this teaching closes {pendingRevisionCount === 1 ? "it" : "them"} and deletes the proposed wording.{" "}
            <Link href="/admin/teaching-revisions" className="underline underline-offset-2">Review {pendingRevisionCount === 1 ? "it" : "them"} first</Link>.
          </p>
        ) : null}
        {teaching.status === "draft" ? (
          <section className="mt-8 rounded-2xl border border-[#284a3b]/10 bg-[#fffdf8] p-5">
            <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#946332]">Ready to publish</p>
            {flags.ready === "marked" ? <p role="status" className="mt-3 rounded-xl border border-[#326048]/20 bg-[#e7efe9] px-4 py-3 text-sm font-bold text-[#326048]">Marked as ready to publish.</p> : null}
            {flags.ready === "cleared" ? <p role="status" className="mt-3 rounded-xl border border-[#326048]/20 bg-[#e7efe9] px-4 py-3 text-sm font-bold text-[#326048]">The ready mark was removed.</p> : null}
            {flags.ready === "error" ? <p role="alert" className="mt-3 text-sm font-bold text-[#a2472c]">The ready mark could not be changed.</p> : null}
            <h2 className="mt-2 text-2xl font-extrabold text-[#243d31]">{teaching.ready_to_publish_at ? "Marked ready to publish" : "Not marked ready"}</h2>
            <p className="mt-3 text-sm leading-6 text-[#607066]">
              Use this to show that a finished draft is waiting for the right day. It is only a note: it does not publish the teaching and does not send any email. The teaching stays a private draft until you press Publish below.
              {teaching.ready_to_publish_at ? <> Marked ready on {new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Chicago" }).format(new Date(teaching.ready_to_publish_at))}.</> : null}
            </p>
            <form action={setTeachingReady.bind(null, id, !teaching.ready_to_publish_at)} className="mt-4">
              <button type="submit" className="admin-secondary-button">{teaching.ready_to_publish_at ? "Remove ready mark" : "Mark as ready to publish"}</button>
            </form>
          </section>
        ) : null}
        <section className="mt-8 rounded-2xl border border-[#a85e32]/20 bg-[#fff8f1] p-5">
          <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#946332]">Publish</p>
          <h2 className="mt-2 text-2xl font-extrabold text-[#243d31]">{teaching.language === "es" ? "Publish to the Español homepage" : teaching.teaching_type === "deep_dive" ? "Publish this Deep Dive" : "Feature this teaching on the homepage"}</h2>
          <p className="mt-3 text-sm leading-6 text-[#607066]">{teaching.language === "es" ? "Publishing makes this teaching public on the Español homepage (/espanol) and features it there. The English homepage is not changed, and no email is sent to subscribers." : teaching.teaching_type === "deep_dive" ? "Publishing makes this Deep Dive public in the Deep Dives collection without replacing the featured homepage teaching." : "Publishing makes this teaching public, replaces the current homepage feature without unpublishing it, and keeps the stored gathering date unchanged."}</p>
          <p className={`mt-4 rounded-xl border px-4 py-3 text-sm font-bold leading-6 ${publishNotice.kind === "email" ? "border-[#a2472c]/30 bg-[#fbeeea] text-[#7d2f1a]" : "border-[#284a3b]/10 bg-white/70 text-[#385245]"}`}>
            {publishNotice.kind === "email" ? "Email: " : ""}{publishNotice.text}
          </p>
          <PublishFeatureButton action={publishAndFeatureTeaching.bind(null, id)} teachingType={teaching.teaching_type === "deep_dive" ? "deep_dive" : "standard"} language={teaching.language === "es" ? "es" : "en"} emailNotice={publishNotice.text} />
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
        <section id="delete-teaching" className="mt-8 scroll-mt-6 rounded-2xl border border-[#a2472c]/30 bg-[#fff3ed] p-5">
          <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#a2472c]">Danger zone</p>
          <h2 className="mt-2 text-2xl font-extrabold text-[#5d2b1f]">Delete teaching</h2>
          <DeleteTeachingButton action={deleteTeaching.bind(null, id)} />
        </section>
      </div>
    </main>
  );
}
