import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { sendForReview, takeBackFromReview } from "@/app/admin/review-gate-actions";
import { ReviewGateMessage, ReviewGateSection } from "@/app/admin/review-gate-section";
import { TeachingDateLabel } from "@/app/teaching-date-label";
import { resolvePrintablePdfHref } from "@/lib/printable-pdf-links";
import { requireAdmin } from "@/lib/supabase/admin";
import { validateHandoutId } from "@/lib/teaching-handouts";
import { loadTeachingChoices } from "../../teaching-choice";
import { HandoutContent } from "../handout-content";
import { BuildHandoutSection, DeleteHandoutButton, DraftUpload, FooterForm, HandoutDetailsForm, PublishSection, TranslateToEspanolButton, UnpublishButton } from "../handout-tools";

export const metadata: Metadata = {
  title: "Handout",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const UNTITLED = "Untitled handout";
const longDate = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "America/Chicago" });

export default async function AdminHandoutPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ review?: string; mailed?: string; of?: string; created?: string }>;
}) {
  const [{ id }, flags] = await Promise.all([params, searchParams]);
  const idResult = validateHandoutId(id);
  if (!idResult.value) notFound();

  const { supabase } = await requireAdmin();
  const { data: handout } = await supabase
    .from("teaching_handouts")
    .select("id, title, gathering_date, teaching_id, language, translation_of, footer_id, status, sent_for_review_at, published_at, printable_pdf_id, content, source_file_name, version_label, version_of")
    .eq("id", idResult.value)
    .maybeSingle();
  if (!handout) notFound();

  const language: "en" | "es" = handout.language === "es" ? "es" : "en";
  const [{ data: proposals }, teachings, { data: pdf }, { data: footerRows }, { data: translation }, { data: original }] = await Promise.all([
    supabase.from("content_revisions").select("id, status").eq("subject_type", "handout").eq("handout_id", idResult.value).in("status", ["draft", "submitted"]),
    loadTeachingChoices(supabase),
    handout.printable_pdf_id ? supabase.from("printable_pdf_links").select("storage_path").eq("id", handout.printable_pdf_id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from("content_footers").select("id, internal_title").eq("status", "active").eq("language", language).order("internal_title", { ascending: true }),
    // The Español version of this handout, if it has one, and the English handout this one was translated from.
    supabase.from("teaching_handouts").select("id, title").eq("translation_of", idResult.value).maybeSingle(),
    handout.translation_of ? supabase.from("teaching_handouts").select("id, title").eq("id", handout.translation_of).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const footers = ((footerRows as { id: string; internal_title: string }[] | null) ?? []).map((row) => ({ id: row.id, title: row.internal_title }));

  const isPublished = handout.status === "published";
  // The other versions of this handout: the one it was made from and the others made from the same one.
  const familyRoot = (handout.version_of as string | null) ?? idResult.value;
  const { data: familyRows } = await supabase
    .from("teaching_handouts")
    .select("id, version_label, status, version_of")
    .or(`id.eq.${familyRoot},version_of.eq.${familyRoot}`);
  const otherVersions = ((familyRows ?? []) as { id: string; version_label: string | null; status: string }[]).filter((row) => row.id !== idResult.value);

  const untitled = !handout.title || handout.title === UNTITLED;
  const blocks = Array.isArray(handout.content) ? handout.content : [];
  const hasDraft = blocks.length > 0;
  const hasDate = Boolean(handout.gathering_date);
  const awaiting = (proposals ?? []).filter((proposal) => proposal.status === "submitted").length;
  const openProposals = (proposals ?? []).length;
  const sent = Boolean(handout.sent_for_review_at);
  const pdfHref = pdf?.storage_path ? resolvePrintablePdfHref(pdf.storage_path, supabase) : null;

  const draftLocked = isPublished
    ? "This handout is published. Unpublish it first to replace its draft."
    : sent
      ? "This handout is with the Content Managers. Take it back from review first to replace its draft."
      : openProposals
        ? "A Content Manager proposal on this handout is still open. Decide or close it on the Revisions page first."
        : null;

  const notReadyToSend = !hasDate ? "Enter the teaching date and save the details first." : !hasDraft ? "Upload the draft first." : null;
  const notReadyToPublish = untitled || !hasDate ? "Enter the title and the teaching date, and save the details, first." : null;

  return (
    <main className="admin-shell">
      <div className="mx-auto max-w-4xl">
        <Link href="/admin/handouts" className="text-sm font-extrabold text-[#946332] hover:text-[#a85e32]">Back to handouts</Link>
        <header className="mt-4 border-b border-[#284a3b]/10 pb-6">
          <p className="text-xs font-black uppercase tracking-wider text-[#946332]">Handout · {language === "es" ? "Español · " : ""}{isPublished ? "Published" : "Draft"}</p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-[#243d31]">{untitled ? "New handout" : handout.title}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <TeachingDateLabel date={handout.gathering_date} />
            {handout.version_label ? <span className="rounded-full bg-[#eee7da] px-3 py-1 text-[10px] font-black uppercase tracking-wider text-[#6b5a3a]">Version: {handout.version_label}</span> : null}
          </div>
          {otherVersions.length ? (
            <p className="mt-3 text-sm text-[#607066]">
              Other versions:{" "}
              {otherVersions.map((version, index) => (
                <span key={version.id}>{index ? ", " : ""}<Link href={`/admin/handouts/${version.id}`} className="font-extrabold text-[#946332] underline underline-offset-2">{version.version_label ?? "Original"}{version.status === "published" ? "" : " (draft)"}</Link></span>
              ))}
            </p>
          ) : null}
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm font-extrabold">
            {!isPublished && hasDraft ? <Link href={`/admin/handouts/${idResult.value}/edit-text`} className="text-[#946332] hover:text-[#a85e32]">Edit text</Link> : null}
            {hasDraft ? <Link href={`/admin/handouts/${idResult.value}/final`} className="text-[#946332] hover:text-[#a85e32]">Final text to copy</Link> : null}
            <Link href="/admin/teaching-revisions" className="text-[#946332] hover:text-[#a85e32]">Revisions{awaiting ? ` (${awaiting} awaiting review)` : ""}</Link>
            <Link href={`/admin/handouts/version?from=${idResult.value}`} className="text-[#946332] hover:text-[#a85e32]">Publish other version</Link>
          </div>
        </header>

        {original ? (
          <p className="mt-6 rounded-xl border border-[#284a3b]/10 bg-[#fffdf8] px-4 py-3 text-sm text-[#385245]">
            Translated from the English handout <Link href={`/admin/handouts/${original.id}`} className="font-extrabold text-[#946332] underline underline-offset-2">{original.title}</Link>.
          </p>
        ) : null}
        {flags.created === "1" ? <p role="status" className="mt-6 rounded-xl border border-[#326048]/20 bg-[#e7efe9] px-4 py-3 text-sm font-bold text-[#326048]">New handout created. Enter its details below, then upload the draft.</p> : null}
        <ReviewGateMessage review={flags.review} mailed={flags.mailed} of={flags.of} />

        {isPublished ? (
          <section className="mt-6 rounded-2xl border border-[#326048]/25 bg-[#e7efe9] p-5">
            <h2 className="text-lg font-extrabold text-[#243d31]">Published</h2>
            <p className="mt-2 text-sm leading-6 text-[#385245]">
              {handout.published_at ? `Published ${longDate.format(new Date(handout.published_at))}. ` : ""}
              The final PDF is in the public PDF library{pdfHref ? <> — <a href={pdfHref} target="_blank" rel="noopener noreferrer" className="font-extrabold text-[#946332] underline underline-offset-2">open the PDF</a></> : null}. You can also manage it under <Link href="/admin/printable-pdfs" className="font-extrabold text-[#946332] underline underline-offset-2">Printable PDF Links</Link>.
              To change the title, date or draft, unpublish it first.
            </p>
            <div className="mt-4"><UnpublishButton id={idResult.value} /></div>
          </section>
        ) : null}

        {!isPublished ? (
          <HandoutDetailsForm key={`${handout.title}|${handout.gathering_date}|${handout.teaching_id}`} id={idResult.value} title={handout.title} date={handout.gathering_date} teachingId={handout.teaching_id} teachings={teachings} untitled={untitled} versionLabel={handout.version_label ?? null} />
        ) : null}

        <DraftUpload id={idResult.value} hasDraft={hasDraft} sourceFileName={handout.source_file_name} locked={draftLocked} />

        {!isPublished ? (
          notReadyToSend ? (
            <section className="mt-6 rounded-2xl border border-[#1a4fb4]/20 bg-[#f4f7fe] p-5">
              <h2 className="text-lg font-extrabold text-[#243d31]">3. Content Manager review</h2>
              <p className="mt-2 text-sm leading-6 text-[#385245]">Optional. {notReadyToSend}</p>
            </section>
          ) : (
            <ReviewGateSection
              noun="handout"
              kind="handout"
              subjectId={idResult.value}
              sentAt={handout.sent_for_review_at ?? null}
              sendAction={sendForReview.bind(null, "handout", idResult.value)}
              takeBackAction={takeBackFromReview.bind(null, "handout", idResult.value)}
            />
          )
        ) : null}

        {!isPublished ? <FooterForm id={idResult.value} footerId={handout.footer_id} footers={footers} language={language} /> : null}

        {hasDraft && !isPublished ? (
          <BuildHandoutSection
            handoutId={idResult.value}
            language={language}
            blocker={!hasDate ? "Enter the teaching date and save the details first. The file is named from it." : !handout.teaching_id ? "This handout is not linked to a teaching yet. Choose the teaching in 1. Details and press Save details (a choice that is not saved does not count). The whiteboard comes from the teaching." : !handout.footer_id ? "Choose a footer in the Handout footer box above and save it." : null}
          />
        ) : null}

        {language === "en" && hasDraft ? (
          <section className="mt-6 rounded-2xl border border-[#284a3b]/10 bg-[#fffdf8] p-5">
            <h2 className="text-lg font-extrabold text-[#243d31]">Español version</h2>
            {translation ? (
              <p className="mt-2 text-sm leading-6 text-[#385245]">
                This handout has an Español version: <Link href={`/admin/handouts/${translation.id}`} className="font-extrabold text-[#946332] underline underline-offset-2">{translation.title}</Link>.
              </p>
            ) : (
              <>
                <p className="mt-1 text-sm leading-6 text-[#607066]">
                  Translates this handout into Español (El Salvador, with the vos forms) following the Spanish Translation Rules, and saves it as a new Español handout linked to this one, with the same teaching and date. Everything is translated in full; nothing is shortened. This handout is not changed. It usually takes under a minute.
                </p>
                <TranslateToEspanolButton handoutId={idResult.value} />
              </>
            )}
          </section>
        ) : null}

        {!isPublished ? <PublishSection id={idResult.value} title={untitled ? "this handout" : handout.title} ready={notReadyToPublish} /> : null}

        {hasDraft ? (
          <section className="mt-8">
            <h2 className="border-b border-[#284a3b]/10 pb-3 text-lg font-extrabold text-[#243d31]">Draft text</h2>
            <div className="py-4">
              <HandoutContent blocks={blocks} />
            </div>
          </section>
        ) : null}

        <footer className="mt-6 border-t border-[#284a3b]/10 pt-6">
          <DeleteHandoutButton id={idResult.value} disabledReason={isPublished ? "Unpublish it before deleting." : null} />
        </footer>
      </div>
    </main>
  );
}
