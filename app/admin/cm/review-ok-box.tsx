import { markReviewedNoChanges, undoReviewedNoChanges } from "./review-ok-actions";
import type { ReviewSubjectKind } from "@/lib/review-subjects";

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "America/Chicago" });

/** The message after pressing one of the buttons. */
export function ReviewOkMessage({ reviewed }: { reviewed?: string }) {
  if (!reviewed) return null;
  if (reviewed === "1") return <p role="status" className="mt-4 rounded-xl border border-[#326048]/20 bg-[#e7efe9] px-4 py-3 text-sm font-bold text-[#326048]">Marked as reviewed. The Administrator can see you found nothing to change.</p>;
  if (reviewed === "undone") return <p role="status" className="mt-4 rounded-xl border border-[#326048]/20 bg-[#e7efe9] px-4 py-3 text-sm font-bold text-[#326048]">Taken back. It is waiting for your review again.</p>;
  return <p role="alert" className="mt-4 rounded-xl border border-[#a2472c]/30 bg-[#f7e6e1] px-4 py-3 text-sm font-bold text-[#a2472c]">That could not be saved. If you have changes started, submit or discard them first.</p>;
}

/**
 * For someone who read it and found nothing to change. Submitting needs at least one change, so without this there would
 * be no way to say "I looked, it is fine". It tells the Administrator and takes the item off the person's review list; it
 * changes nothing about the item.
 */
export function ReviewOkBox({ kind, id, noun, okAt }: { kind: Exclude<ReviewSubjectKind, "weekly_update">; id: string; noun: string; okAt: string | null }) {
  return (
    <section className="mt-6 rounded-2xl border border-[#326048]/20 bg-[#f1f6f2] p-5">
      {okAt ? (
        <>
          <p className="font-extrabold text-[#326048]">You marked this {noun} reviewed, no changes needed</p>
          <p className="mt-1 text-sm leading-6 text-[#385245]">On {dateFormat.format(new Date(okAt))}. The Administrator can see it. If you change your mind, take it back and it returns to your review list.</p>
          <form action={undoReviewedNoChanges.bind(null, kind, id)} className="mt-3">
            <button type="submit" className="admin-secondary-button">Take it back</button>
          </form>
        </>
      ) : (
        <>
          <p className="font-extrabold text-[#243d31]">Nothing to change?</p>
          <p className="mt-1 text-sm leading-6 text-[#385245]">If you read this {noun} and found nothing to change, tell the Administrator. It does not change the {noun}, and it comes off your review list.</p>
          <form action={markReviewedNoChanges.bind(null, kind, id)} className="mt-3">
            <button type="submit" className="admin-primary-button"><span>Mark as reviewed, no changes</span></button>
          </form>
        </>
      )}
    </section>
  );
}
