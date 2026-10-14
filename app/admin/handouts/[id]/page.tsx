import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { sendForReview, takeBackFromReview } from "@/app/admin/review-gate-actions";
import { ReviewGateMessage, ReviewGateSection } from "@/app/admin/review-gate-section";
import { TeachingDateLabel } from "@/app/teaching-date-label";
import { requireAdmin } from "@/lib/supabase/admin";
import { validateHandoutId } from "@/lib/teaching-handouts";
import { HandoutContent } from "../handout-content";
import { loadTeachingChoices } from "../../teaching-choice";
import { DeleteHandoutButton, HandoutDateForm, HandoutTeachingForm } from "../handout-tools";

export const metadata: Metadata = {
  title: "Handout",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminHandoutPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ review?: string; mailed?: string; of?: string; saved?: string }>;
}) {
  const [{ id }, flags] = await Promise.all([params, searchParams]);
  const idResult = validateHandoutId(id);
  if (!idResult.value) notFound();

  const { supabase } = await requireAdmin();
  const { data: handout } = await supabase
    .from("teaching_handouts")
    .select("id, title, gathering_date, teaching_id, sent_for_review_at, content, source_file_name")
    .eq("id", idResult.value)
    .maybeSingle();
  if (!handout) notFound();

  // Proposals Content Managers have submitted and the Administrator has not finished with.
  const { count: awaiting } = await supabase
    .from("content_revisions")
    .select("id", { count: "exact", head: true })
    .eq("subject_type", "handout")
    .eq("handout_id", idResult.value)
    .eq("status", "submitted");

  return (
    <main className="admin-shell">
      <div className="mx-auto max-w-4xl">
        <Link href="/admin/handouts" className="text-sm font-extrabold text-[#946332] hover:text-[#a85e32]">Back to handouts</Link>
        <header className="mt-4 border-b border-[#284a3b]/10 pb-6">
          <p className="text-xs font-black uppercase tracking-wider text-[#946332]">Handout</p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-[#243d31]">{handout.title}</h1>
          <div className="mt-3"><TeachingDateLabel date={handout.gathering_date} /></div>
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm font-extrabold">
            <Link href={`/admin/handouts/${idResult.value}/edit-text`} className="text-[#946332] hover:text-[#a85e32]">Edit text</Link>
            <Link href={`/admin/handouts/${idResult.value}/final`} className="text-[#946332] hover:text-[#a85e32]">Final text to copy</Link>
            <Link href="/admin/teaching-revisions" className="text-[#946332] hover:text-[#a85e32]">Revisions{awaiting ? ` (${awaiting} awaiting review)` : ""}</Link>
          </div>
          {handout.source_file_name ? <p className="mt-2 text-xs text-[#607066]">Uploaded from {handout.source_file_name}.</p> : null}
          <HandoutDateForm id={idResult.value} date={handout.gathering_date} />
          <HandoutTeachingForm id={idResult.value} teachingId={handout.teaching_id} teachings={await loadTeachingChoices(supabase)} />
        </header>

        {flags.saved === "1" ? <p role="status" className="mt-6 rounded-xl border border-[#326048]/20 bg-[#e7efe9] px-4 py-3 text-sm font-bold text-[#326048]">Saved as a draft. Check it below, then send it to the Content Managers.</p> : null}
        <ReviewGateMessage review={flags.review} mailed={flags.mailed} of={flags.of} />
        <ReviewGateSection
          noun="handout"
          sentAt={handout.sent_for_review_at ?? null}
          sendAction={sendForReview.bind(null, "handout", idResult.value)}
          takeBackAction={takeBackFromReview.bind(null, "handout", idResult.value)}
        />

        <div className="py-6">
          <HandoutContent blocks={handout.content} />
        </div>

        <footer className="border-t border-[#284a3b]/10 pt-6">
          <DeleteHandoutButton id={idResult.value} />
        </footer>
      </div>
    </main>
  );
}
