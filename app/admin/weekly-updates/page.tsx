import type { Metadata } from "next";
import Link from "next/link";
import { archiveWeeklyUpdate, createWeeklyUpdate, publishWeeklyUpdate, updateWeeklyUpdate } from "./actions";
import { WeeklyUpdateEditor, type WeeklyUpdateChalkboardOption, type WeeklyUpdateFooterOption } from "./weekly-update-editor";
import { WeeklyUpdateStatusButton } from "./status-buttons";
import { WeeklyUpdateTestSendForm } from "./test-send-form";
import { WeeklyUpdateContent } from "@/app/weekly-update/weekly-update-content";
import { ContentFooter } from "@/app/content-footer";
import { requireAdmin } from "@/lib/supabase/admin";

export const metadata: Metadata = {
  title: "Weekly Updates",
  robots: { index: false, follow: false },
};

function formatDate(value: string | null) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(value));
}

export default async function AdminWeeklyUpdatesPage({ searchParams }: { searchParams: Promise<{ created?: string; published?: string; archived?: string }> }) {
  const params = await searchParams;
  const { supabase } = await requireAdmin();
  const [{ data: updates, error }, { data: chalkboards }, { data: chalkboardAssignments }, { data: footers }, { data: footerAssignments }] = await Promise.all([
    supabase
      .from("weekly_updates")
      .select("id, title, body_markdown, converted_content, source_document_file_name, source_document_storage_path, status, is_current, published_at, archived_at, updated_at, chalkboard_asset_id")
      .order("is_current", { ascending: false })
      .order("updated_at", { ascending: false }),
    supabase
      .from("chalkboard_assets")
      .select("id, canonical_name, title, chalkboard_date")
      .eq("status", "active")
      .eq("is_current_version", true)
      .or("website_storage_path.not.is.null,storage_path.not.is.null")
      .order("chalkboard_date", { ascending: false })
      .order("canonical_name", { ascending: true }),
    supabase.from("weekly_update_chalkboard_assignments").select("weekly_update_id, chalkboard_asset_id, display_order").order("display_order", { ascending: true }),
    supabase.from("content_footers").select("id, internal_title, content").eq("status", "active").order("internal_title", { ascending: true }),
    supabase.from("weekly_update_footer_assignments").select("weekly_update_id, footer_id"),
  ]);
  const chalkboardOptions: WeeklyUpdateChalkboardOption[] = (chalkboards ?? []).map((chalkboard) => ({
    id: chalkboard.id,
    label: `${formatDate(chalkboard.chalkboard_date)} - ${chalkboard.canonical_name ?? chalkboard.title}`,
  }));
  const footerOptions: WeeklyUpdateFooterOption[] = (footers ?? []).map((footer) => ({ id: footer.id, label: footer.internal_title }));
  const chalkboardLabels = new Map(chalkboardOptions.map((chalkboard) => [chalkboard.id, chalkboard.label]));
  const footerLabels = new Map(footerOptions.map((footer) => [footer.id, footer.label]));
  const footerContent = new Map((footers ?? []).map((footer) => [footer.id, footer.content]));
  const chalkboardIdsByUpdate = new Map<string, string[]>();
  for (const assignment of chalkboardAssignments ?? []) {
    const current = chalkboardIdsByUpdate.get(assignment.weekly_update_id) ?? [];
    current.push(assignment.chalkboard_asset_id);
    chalkboardIdsByUpdate.set(assignment.weekly_update_id, current);
  }
  const footerIdByUpdate = new Map((footerAssignments ?? []).map((assignment) => [assignment.weekly_update_id as string, assignment.footer_id as string]));

  return (
    <main className="admin-shell">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-col gap-5 border-b border-[#284a3b]/10 pb-8 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Link href="/admin" className="text-sm font-extrabold text-[#946332] hover:text-[#a85e32]">Back to dashboard</Link>
            <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-[#243d31]">Weekly Updates</h1>
            <p className="mt-3 text-sm text-[#607066]">Upload a Word document, preview the converted content, publish the current update, and keep archives private to administrators.</p>
          </div>
          <Link href="/weekly-update" className="admin-secondary-button inline-flex items-center justify-center">View public page</Link>
        </header>

        {params.created === "1" ? <p role="status" className="mt-6 rounded-xl border border-[#326048]/20 bg-[#e7efe9] px-4 py-3 text-sm font-bold text-[#326048]">Weekly update created.</p> : null}
        {params.published === "1" ? <p role="status" className="mt-6 rounded-xl border border-[#326048]/20 bg-[#e7efe9] px-4 py-3 text-sm font-bold text-[#326048]">Weekly update published.</p> : null}
        {params.archived === "1" ? <p role="status" className="mt-6 rounded-xl border border-[#326048]/20 bg-[#e7efe9] px-4 py-3 text-sm font-bold text-[#326048]">Weekly update archived.</p> : null}

        <section className="py-8">
          <article className="rounded-2xl border border-[#284a3b]/10 bg-[#fffdf8] p-5 shadow-lg shadow-[#4d5f52]/8 sm:p-6">
            <h2 className="text-2xl font-extrabold text-[#243d31]">New weekly update</h2>
            <div className="mt-5"><WeeklyUpdateEditor action={createWeeklyUpdate} chalkboards={chalkboardOptions} footers={footerOptions} submitLabel="Upload and convert draft" sourceRequired /></div>
          </article>
        </section>

        <section className="border-t border-[#284a3b]/10 py-8">
          <h2 className="text-2xl font-extrabold text-[#243d31]">Update archive</h2>
          {error ? <p className="mt-4 text-sm font-bold text-[#a2472c]">Weekly updates could not be loaded.</p> : null}
          {updates?.length ? (
            <div className="mt-5 grid gap-5">
              {updates.map((update) => (
                <article key={update.id} className="rounded-2xl border border-[#284a3b]/10 bg-[#fffdf8] p-5 shadow-lg shadow-[#4d5f52]/8">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#946332]">{update.is_current ? "Current" : update.status}</p>
                      <h3 className="mt-2 text-2xl font-extrabold text-[#243d31]">{update.title}</h3>
                      <p className="mt-2 text-sm text-[#607066]">Published: {formatDate(update.published_at)}{update.archived_at ? ` · Archived: ${formatDate(update.archived_at)}` : ""}</p>
                      <p className="mt-1 text-sm text-[#607066]">Source document: <span className="font-bold text-[#385245]">{update.source_document_file_name ?? "Not retained"}</span></p>
                      <p className="mt-1 text-sm text-[#607066]">Weekly Update chalkboards: <span className="font-bold text-[#385245]">{(chalkboardIdsByUpdate.get(update.id) ?? (update.chalkboard_asset_id ? [update.chalkboard_asset_id] : [])).map((id) => chalkboardLabels.get(id)).filter(Boolean).join(", ") || "None selected"}</span></p>
                      <p className="mt-1 text-sm text-[#607066]">Footer: <span className="font-bold text-[#385245]">{footerLabels.get(footerIdByUpdate.get(update.id) ?? "") ?? "None selected"}</span></p>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      {update.status !== "archived" ? <WeeklyUpdateStatusButton action={publishWeeklyUpdate} weeklyUpdateId={update.id} intent="publish" label="Publish current" /> : null}
                      {update.status !== "archived" ? <WeeklyUpdateStatusButton action={archiveWeeklyUpdate} weeklyUpdateId={update.id} intent="archive" label="Archive" variant="danger" /> : null}
                    </div>
                  </div>
                  {update.status !== "archived" ? (
                    <details className="mt-5">
                      <summary className="cursor-pointer text-sm font-extrabold text-[#9d5a2f]">Edit title or replace document</summary>
                      <div className="mt-4"><WeeklyUpdateEditor action={updateWeeklyUpdate} weeklyUpdateId={update.id} initialTitle={update.title} initialChalkboardAssetIds={chalkboardIdsByUpdate.get(update.id) ?? (update.chalkboard_asset_id ? [update.chalkboard_asset_id] : [])} initialFooterId={footerIdByUpdate.get(update.id) ?? ""} chalkboards={chalkboardOptions} footers={footerOptions} /></div>
                    </details>
                  ) : null}
                  {update.status !== "archived" ? (
                    <details className="mt-5">
                      <summary className="cursor-pointer text-sm font-extrabold text-[#9d5a2f]">Send a test email</summary>
                      <div className="mt-4"><WeeklyUpdateTestSendForm weeklyUpdateId={update.id} /></div>
                    </details>
                  ) : null}
                  <details className="mt-5">
                    <summary className="cursor-pointer text-sm font-extrabold text-[#9d5a2f]">Preview converted content</summary>
                    <div className="mt-5 rounded-xl border border-[#284a3b]/10 bg-white p-5">
                      <WeeklyUpdateContent body={update.body_markdown} blocks={update.converted_content} />
                      <ContentFooter content={footerContent.get(footerIdByUpdate.get(update.id) ?? "")} />
                    </div>
                  </details>
                </article>
              ))}
            </div>
          ) : <p className="mt-4 text-sm text-[#607066]">No weekly updates have been created yet.</p>}
        </section>
      </div>
    </main>
  );
}
