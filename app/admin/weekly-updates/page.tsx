import type { Metadata } from "next";
import Link from "next/link";
import { archiveWeeklyUpdate, createWeeklyUpdate, deleteWeeklyUpdate, publishWeeklyUpdate, sendWeeklyUpdateToProofing, setWeeklyUpdateReady, takeWeeklyUpdateBackFromProofing, updateWeeklyUpdate } from "./actions";
import { WeeklyUpdateEditor, type WeeklyUpdateChalkboardOption, type WeeklyUpdateFooterOption } from "./weekly-update-editor";
import { WeeklyUpdateDeleteButton, WeeklyUpdateStatusButton } from "./status-buttons";
import { WeeklyUpdateTestSendForm } from "./test-send-form";
import { FinishSendingButton } from "./finish-sending-button";
import { SendToSubscriberForm } from "./send-to-subscriber-form";
import { WeeklyUpdateContent } from "@/app/weekly-update/weekly-update-content";
import { ContentFooter } from "@/app/content-footer";
import { requireAdmin } from "@/lib/supabase/admin";
import { getWeeklyUpdateEmailLookup } from "@/lib/weekly-update-publish-info";
import { weeklyUpdatePublishNotice } from "@/lib/weekly-update-publish-notice";
import type { ConversionNote } from "@/lib/weekly-update-docx";

export const metadata: Metadata = {
  title: "Weekly Updates",
  robots: { index: false, follow: false },
};

function formatDate(value: string | null) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(value));
}

export default async function AdminWeeklyUpdatesPage({ searchParams }: { searchParams: Promise<{ created?: string; published?: string; archived?: string; deleted?: string; ready?: string; proofing?: string }> }) {
  const params = await searchParams;
  const { supabase } = await requireAdmin();
  const [{ data: updates, error }, { data: chalkboards }, { data: chalkboardAssignments }, { data: footers }, { data: footerAssignments }] = await Promise.all([
    supabase
      .from("weekly_updates")
      .select("id, title, language, body_markdown, converted_content, source_document_file_name, source_document_storage_path, status, is_current, published_at, archived_at, updated_at, chalkboard_asset_id, conversion_report, ready_to_publish_at, sent_to_proofing_at")
      .order("is_current", { ascending: false })
      .order("updated_at", { ascending: false }),
    supabase
      .from("chalkboard_assets")
      .select("id, canonical_name, title, chalkboard_date, language")
      .eq("status", "active")
      .eq("is_current_version", true)
      .or("website_storage_path.not.is.null,storage_path.not.is.null")
      .order("chalkboard_date", { ascending: false })
      .order("canonical_name", { ascending: true }),
    supabase.from("weekly_update_chalkboard_assignments").select("weekly_update_id, chalkboard_asset_id, display_order").order("display_order", { ascending: true }),
    supabase.from("content_footers").select("id, internal_title, content, language").eq("status", "active").order("internal_title", { ascending: true }),
    supabase.from("weekly_update_footer_assignments").select("weekly_update_id, footer_id"),
  ]);
  const chalkboardOptions: WeeklyUpdateChalkboardOption[] = (chalkboards ?? []).map((chalkboard) => ({
    id: chalkboard.id,
    label: `${formatDate(chalkboard.chalkboard_date)} - ${chalkboard.canonical_name ?? chalkboard.title}`,
    language: chalkboard.language === "es" ? "es" : "en",
  }));
  const footerOptions: WeeklyUpdateFooterOption[] = (footers ?? []).map((footer) => ({ id: footer.id, label: footer.internal_title, language: footer.language === "es" ? "es" as const : "en" as const }));
  const chalkboardLabels = new Map(chalkboardOptions.map((chalkboard) => [chalkboard.id, chalkboard.label]));
  const footerLabels = new Map(footerOptions.map((footer) => [footer.id, footer.label]));
  const footerContent = new Map((footers ?? []).map((footer) => [footer.id, footer.content]));
  const chalkboardIdsByUpdate = new Map<string, string[]>();
  for (const assignment of chalkboardAssignments ?? []) {
    const current = chalkboardIdsByUpdate.get(assignment.weekly_update_id) ?? [];
    current.push(assignment.chalkboard_asset_id);
    chalkboardIdsByUpdate.set(assignment.weekly_update_id, current);
  }
  const emailLookup = await getWeeklyUpdateEmailLookup(supabase);
  // Work that still needs attention comes first: drafts, then the current published updates, then the
  // archive. Within each group the most recently edited is first.
  const listRank = (item: { status: string; is_current: boolean }) => (item.status === "draft" ? 0 : item.is_current ? 1 : 2);
  const sortedUpdates = [...(updates ?? [])].sort((a, b) => listRank(a) - listRank(b) || String(b.updated_at).localeCompare(String(a.updated_at)));

  // There is one current update PER LANGUAGE; publishing replaces only the current update of the same language.
  const currentByLanguage = { en: (updates ?? []).find((item) => item.is_current && item.language !== "es"), es: (updates ?? []).find((item) => item.is_current && item.language === "es") };
  // Co-editor proposals still waiting on a decision, per weekly update. Publishing closes them (and deletes
  // their text), so each draft says so instead of letting it come as a surprise.
  const { data: waitingRevisions } = await supabase.from("content_revisions").select("weekly_update_id").eq("subject_type", "weekly_update").eq("status", "submitted");
  const waitingByUpdate = new Map<string, number>();
  for (const revision of waitingRevisions ?? []) {
    if (revision.weekly_update_id) waitingByUpdate.set(revision.weekly_update_id, (waitingByUpdate.get(revision.weekly_update_id) ?? 0) + 1);
  }
  // Who each draft was sent to, and where each one is: waiting, or submitted with or without proposed changes.
  const sentDraftIds = (updates ?? []).filter((item) => item.status === "draft" && item.sent_to_proofing_at).map((item) => item.id);
  const { data: proofingRows } = sentDraftIds.length
    ? await supabase.from("weekly_update_proofings").select("weekly_update_id, user_id, user_name, submitted_at").in("weekly_update_id", sentDraftIds).order("user_name", { ascending: true })
    : { data: [] as { weekly_update_id: string; user_id: string; user_name: string | null; submitted_at: string | null }[] };
  const { data: proofRevisions } = sentDraftIds.length
    ? await supabase.from("content_revisions").select("id, weekly_update_id, submitted_by, total_changes").eq("subject_type", "weekly_update").eq("status", "submitted").in("weekly_update_id", sentDraftIds)
    : { data: [] as { id: string; weekly_update_id: string; submitted_by: string; total_changes: number }[] };
  const proofsByUpdate = new Map<string, NonNullable<typeof proofingRows>>();
  for (const row of proofingRows ?? []) proofsByUpdate.set(row.weekly_update_id, [...(proofsByUpdate.get(row.weekly_update_id) ?? []), row]);
  const proofRevisionByKey = new Map((proofRevisions ?? []).map((row) => [`${row.weekly_update_id}:${row.submitted_by}`, row]));

  const { data: unfinishedSends } = await supabase
    .from("email_broadcast_events")
    .select("weekly_update_id, status, recipient_count")
    .neq("status", "sent");
  const { data: deliveredRows } = await supabase
    .from("email_broadcast_deliveries")
    .select("weekly_update_id")
    .eq("status", "sent")
    .in("weekly_update_id", (unfinishedSends ?? []).map((row) => row.weekly_update_id as string));
  const deliveredByUpdate = new Map<string, number>();
  for (const row of deliveredRows ?? []) deliveredByUpdate.set(row.weekly_update_id as string, (deliveredByUpdate.get(row.weekly_update_id as string) ?? 0) + 1);
  const unfinishedByUpdate = new Map((unfinishedSends ?? []).map((row) => [row.weekly_update_id as string, row]));
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
        {params.deleted === "1" ? <p role="status" className="mt-6 rounded-xl border border-[#326048]/20 bg-[#e7efe9] px-4 py-3 text-sm font-bold text-[#326048]">Weekly update deleted.</p> : null}

        {params.proofing === "sent" ? <p role="status" className="mt-6 rounded-xl border border-[#326048]/20 bg-[#e7efe9] px-4 py-3 text-sm font-bold text-[#326048]">Sent to the Content Managers for proofing. Nothing was published or emailed to subscribers.</p> : null}
        {params.proofing === "takenback" ? <p role="status" className="mt-6 rounded-xl border border-[#326048]/20 bg-[#e7efe9] px-4 py-3 text-sm font-bold text-[#326048]">Taken back from proofing.</p> : null}
        {params.proofing === "error" ? <p role="alert" className="mt-6 rounded-xl border border-[#a2472c]/30 bg-[#f7e6e1] px-4 py-3 text-sm font-bold text-[#a2472c]">That could not be changed. Only drafts can be sent for proofing.</p> : null}
        {params.proofing === "nocm" ? <p role="alert" className="mt-6 rounded-xl border border-[#a2472c]/30 bg-[#f7e6e1] px-4 py-3 text-sm font-bold text-[#a2472c]">There are no active Content Managers to send it to. Add one under Content Managers first.</p> : null}
        {params.ready === "marked" ? <p role="status" className="mt-6 rounded-xl border border-[#326048]/20 bg-[#e7efe9] px-4 py-3 text-sm font-bold text-[#326048]">Marked as ready to publish. Nothing was published or emailed.</p> : null}
        {params.ready === "cleared" ? <p role="status" className="mt-6 rounded-xl border border-[#326048]/20 bg-[#e7efe9] px-4 py-3 text-sm font-bold text-[#326048]">Ready to publish mark removed.</p> : null}
        {params.ready === "error" ? <p role="alert" className="mt-6 rounded-xl border border-[#a2472c]/30 bg-[#f7e6e1] px-4 py-3 text-sm font-bold text-[#a2472c]">The ready mark could not be changed. Only drafts can be marked.</p> : null}

        <section className="py-8">
          <article className="rounded-2xl border border-[#284a3b]/10 bg-[#fffdf8] p-5 shadow-lg shadow-[#4d5f52]/8 sm:p-6">
            <h2 className="text-2xl font-extrabold text-[#243d31]">New weekly update</h2>
            <div className="mt-5"><WeeklyUpdateEditor action={createWeeklyUpdate} chalkboards={chalkboardOptions} footers={footerOptions} submitLabel="Upload and convert draft" sourceRequired /></div>
          </article>
        </section>

        <section className="border-t border-[#284a3b]/10 py-8">
          <h2 className="text-2xl font-extrabold text-[#243d31]">Update archive</h2>
          {error ? <p className="mt-4 text-sm font-bold text-[#a2472c]">Weekly updates could not be loaded.</p> : null}
          {sortedUpdates.length ? (
            <div className="mt-5 grid gap-5">
              {sortedUpdates.map((update) => {
                const notes = ((update.conversion_report as { notes?: ConversionNote[] } | null)?.notes ?? []);
                const updateLanguage = update.language === "es" ? "es" : "en";
                const currentOfLanguage = currentByLanguage[updateLanguage];
                const publishNotice = weeklyUpdatePublishNotice({
                  alreadySent: emailLookup.sentIds.has(update.id),
                  recipientCount: updateLanguage === "es" ? emailLookup.recipientCountEs : emailLookup.recipientCount,
                  replacesTitle: currentOfLanguage && currentOfLanguage.id !== update.id ? currentOfLanguage.title : null,
                  language: updateLanguage,
                });
                const proofs = proofsByUpdate.get(update.id) ?? [];
                const proofsOutstanding = proofs.some((proof) => !proof.submitted_at);
                return (
                <article key={update.id} className="rounded-2xl border border-[#284a3b]/10 bg-[#fffdf8] p-5 shadow-lg shadow-[#4d5f52]/8">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#946332]">{update.is_current ? "Current" : update.status} · {update.language === "es" ? "Español" : "English"}{update.status === "draft" && update.ready_to_publish_at ? <span className="ml-2 rounded-full bg-[#e8f0fe] px-3 py-1 text-[10px] font-black tracking-wider text-[#1a4fb4]">Ready to publish</span> : null}{update.status === "draft" && update.sent_to_proofing_at ? <span className="ml-2 rounded-full bg-[#fbf1e1] px-3 py-1 text-[10px] font-black tracking-wider text-[#7a4a1d]">Proofs {proofs.filter((proof) => proof.submitted_at).length} of {proofs.length} in</span> : null}</p>
                      <h3 className="mt-2 text-2xl font-extrabold text-[#243d31]">{update.title}</h3>
                      <p className="mt-2 text-sm text-[#607066]">Published: {formatDate(update.published_at)}{update.archived_at ? ` · Archived: ${formatDate(update.archived_at)}` : ""}</p>
                      <p className="mt-1 text-sm text-[#607066]">Source document: <span className="font-bold text-[#385245]">{update.source_document_file_name ?? "Not retained"}</span></p>
                      <p className="mt-1 text-sm text-[#607066]">Weekly Update chalkboards: <span className="font-bold text-[#385245]">{(chalkboardIdsByUpdate.get(update.id) ?? (update.chalkboard_asset_id ? [update.chalkboard_asset_id] : [])).map((id) => chalkboardLabels.get(id)).filter(Boolean).join(", ") || "None selected"}</span></p>
                      <p className="mt-1 text-sm text-[#607066]">Footer: <span className="font-bold text-[#385245]">{footerLabels.get(footerIdByUpdate.get(update.id) ?? "") ?? "None selected"}</span></p>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      {update.status !== "archived" ? <WeeklyUpdateStatusButton action={publishWeeklyUpdate} weeklyUpdateId={update.id} intent="publish" label="Publish current" confirmMessage={update.status === "draft" && (!update.ready_to_publish_at || proofsOutstanding) ? `${[!update.ready_to_publish_at ? "This draft has not been marked ready to publish." : "", proofsOutstanding ? `${proofs.filter((proof) => !proof.submitted_at).length} of ${proofs.length} Content Managers have not submitted their proof yet. Publishing ends their review.` : ""].filter(Boolean).join("\n")}\n\n${publishNotice.confirm}` : publishNotice.confirm} /> : null}
                      {update.status !== "archived" ? <WeeklyUpdateStatusButton action={archiveWeeklyUpdate} weeklyUpdateId={update.id} intent="archive" label="Archive" variant="danger" /> : null}
                      {!update.is_current ? <WeeklyUpdateDeleteButton action={deleteWeeklyUpdate} weeklyUpdateId={update.id} title={update.title} /> : null}
                    </div>
                  </div>
                  {update.status === "draft" && waitingByUpdate.get(update.id) ? (
                    <p role="status" className="mt-4 rounded-xl border border-[#1a4fb4]/20 bg-[#e8f0fe] px-4 py-3 text-sm font-bold leading-6 text-[#1a3f8a]">
                      {waitingByUpdate.get(update.id)} co-editor {waitingByUpdate.get(update.id) === 1 ? "revision is" : "revisions are"} waiting for your review. Publishing this update closes {waitingByUpdate.get(update.id) === 1 ? "it" : "them"} and deletes the proposed wording.{" "}
                      <Link href="/admin/teaching-revisions" className="underline underline-offset-2">Review {waitingByUpdate.get(update.id) === 1 ? "it" : "them"} first</Link>.
                    </p>
                  ) : null}
                  {update.status !== "archived" ? (
                    <p role="note" className={`mt-4 rounded-xl border px-4 py-3 text-sm font-bold ${publishNotice.kind === "email" ? "border-[#946332]/30 bg-[#fbf1e1] text-[#7a4a1d]" : "border-[#284a3b]/15 bg-[#f4f6f1] text-[#385245]"}`}>{publishNotice.text}</p>
                  ) : null}
                  {update.is_current && update.status === "published" && unfinishedByUpdate.has(update.id) ? (
                    <FinishSendingButton weeklyUpdateId={update.id} sentCount={deliveredByUpdate.get(update.id) ?? 0} recipientCount={unfinishedByUpdate.get(update.id)?.recipient_count ?? 0} />
                  ) : null}
                  {notes.length && update.status !== "archived" ? (
                    <div className="mt-4 rounded-xl border border-[#284a3b]/15 bg-[#fffdf8] p-4">
                      <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#946332]">Upload check</p>
                      <ul className="mt-2 space-y-2">
                        {notes.map((note) => (
                          <li key={note.code} className={`rounded-lg px-3 py-2 text-sm ${note.level === "warning" ? "bg-[#fbf1e1] font-bold text-[#7a4a1d]" : "bg-[#f4f6f1] text-[#385245]"}`}>
                            <span className="mr-2 text-[10px] font-black uppercase tracking-wider">{note.level === "warning" ? "Check" : "Note"}</span>{note.message}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : update.status === "draft" && update.conversion_report ? (
                    <p className="mt-4 text-sm font-bold text-[#326048]">Upload check: nothing was lost or changed in the conversion.</p>
                  ) : null}
                  {update.status === "draft" ? (
                    <div className="mt-4 rounded-xl border border-[#284a3b]/15 bg-[#f4f6f1] p-4">
                      <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#946332]">Proofing</p>
                      {!update.sent_to_proofing_at ? (
                        <>
                          <p className="mt-2 text-sm leading-6 text-[#385245]">When you have reviewed this draft, send it to the Content Managers to proofread. Every registered Content Manager gets their own copy and one pass at it, and submitting it back is their OK to publish. Nothing is emailed to subscribers.</p>
                          <form action={sendWeeklyUpdateToProofing.bind(null, update.id)} className="mt-3">
                            <button type="submit" className="admin-secondary-button">Send to Content Managers for proofing</button>
                          </form>
                        </>
                      ) : (
                        <>
                          <p className="mt-2 text-sm leading-6 text-[#385245]">Sent to the Content Managers on {formatDate(update.sent_to_proofing_at)}. Each one has one pass. Review every proof, accept or reject their changes, make your own edits, and publish when you are satisfied. You do not need to wait for anyone: publishing ends their review.</p>
                          <ul className="mt-3 divide-y divide-[#284a3b]/10 rounded-lg bg-white/70 text-sm">
                            {proofs.map((proof) => {
                              const revision = proofRevisionByKey.get(`${update.id}:${proof.user_id}`);
                              return (
                                <li key={proof.user_id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2">
                                  <span className="min-w-0 flex-1 font-extrabold text-[#243d31]">{proof.user_name ?? "Content Manager"}</span>
                                  <span className={proof.submitted_at ? "font-bold text-[#326048]" : "font-bold text-[#7a4a1d]"}>{proof.submitted_at ? `Submitted ${formatDate(proof.submitted_at)}: OK to publish` : "Waiting"}</span>
                                  {revision ? (
                                    <Link href={`/admin/teaching-revisions/${revision.id}`} className="font-extrabold text-[#1a4fb4] underline underline-offset-2">Review {revision.total_changes} proposed {revision.total_changes === 1 ? "change" : "changes"}</Link>
                                  ) : proof.submitted_at ? (
                                    <span className="text-[#607066]">No changes proposed</span>
                                  ) : null}
                                </li>
                              );
                            })}
                          </ul>
                          <div className="mt-3 flex flex-wrap gap-3">
                            <form action={sendWeeklyUpdateToProofing.bind(null, update.id)}>
                              <button type="submit" className="admin-secondary-button">Send to any Content Managers added since</button>
                            </form>
                            <form action={takeWeeklyUpdateBackFromProofing.bind(null, update.id)}>
                              <button type="submit" className="admin-secondary-button">Take back from proofing</button>
                            </form>
                          </div>
                        </>
                      )}
                    </div>
                  ) : null}
                  {update.status === "draft" ? (
                    <form action={setWeeklyUpdateReady.bind(null, update.id, !update.ready_to_publish_at)} className="mt-4">
                      <button type="submit" className="admin-secondary-button">{update.ready_to_publish_at ? "Remove ready mark" : "Mark as ready to publish"}</button>
                    </form>
                  ) : null}
                  {update.status !== "archived" ? (
                    <details className="mt-5">
                      <summary className="cursor-pointer text-sm font-extrabold text-[#9d5a2f]">Edit title or replace document</summary>
                      <div className="mt-4"><WeeklyUpdateEditor action={updateWeeklyUpdate} weeklyUpdateId={update.id} initialLanguage={update.language === "es" ? "es" : "en"} languageLocked initialTitle={update.title} initialChalkboardAssetIds={chalkboardIdsByUpdate.get(update.id) ?? (update.chalkboard_asset_id ? [update.chalkboard_asset_id] : [])} initialFooterId={footerIdByUpdate.get(update.id) ?? ""} chalkboards={chalkboardOptions} footers={footerOptions} /></div>
                    </details>
                  ) : null}
                  {update.is_current && update.status === "published" ? (
                    <details className="mt-5">
                      <summary className="cursor-pointer text-sm font-extrabold text-[#9d5a2f]">Send to one subscriber who missed it</summary>
                      <div className="mt-4"><SendToSubscriberForm weeklyUpdateId={update.id} /></div>
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
                );
              })}
            </div>
          ) : <p className="mt-4 text-sm text-[#607066]">No weekly updates have been created yet.</p>}
        </section>
      </div>
    </main>
  );
}
