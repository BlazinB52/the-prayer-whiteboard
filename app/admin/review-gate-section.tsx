import { ConfirmButton } from "@/app/admin/teaching-revisions/confirm-button";
import { createClient } from "@/lib/supabase/server";
import { REVIEW_NOTE_MAX_LENGTH } from "@/lib/review-ready-email";
import { listActiveContentManagers, type ContentManagerOption } from "@/lib/review-recipients";
import type { ReviewSubjectKind } from "@/lib/review-subjects";

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "America/Chicago" });

export function ReviewGateMessage({ review, mailed, of }: { review?: string; mailed?: string; of?: string }) {
  if (!review) return null;
  const ok = "mt-6 rounded-xl border border-[#326048]/20 bg-[#e7efe9] px-4 py-3 text-sm font-bold text-[#326048]";
  const warn = "mt-6 rounded-xl border border-[#c49a3a]/40 bg-[#fbf4e1] px-4 py-3 text-sm font-bold text-[#6b5013]";
  const bad = "mt-6 rounded-xl border border-[#a2472c]/30 bg-[#f7e6e1] px-4 py-3 text-sm font-bold text-[#a2472c]";
  if (review === "sent") return <p role="status" className={ok}>Sent. {mailed ? `${mailed} of ${of} ${of === "1" ? "Content Manager was" : "Content Managers were"} emailed.` : ""}</p>;
  if (review === "partial") return <p role="alert" className={warn}>Sent, but only {mailed} of {of} emails went out. They can still see it when they sign in; please tell the others directly.</p>;
  if (review === "nocm") return <p role="alert" className={warn}>Sent, but none of the chosen Content Managers has an email address to notify.</p>;
  if (review === "nopick") return <p role="alert" className={warn}>Nothing was sent. Tick at least one Content Manager to send it to.</p>;
  if (review === "takenback") return <p role="status" className={ok}>Taken back. Content Managers can no longer see it. Proposals they already submitted are still waiting on the Revisions page.</p>;
  if (review === "already") return <p role="status" className={ok}>Everyone you chose already has it, so nobody was emailed again.</p>;
  return <p role="alert" className={bad}>That could not be changed. Only a draft can be sent for review.</p>;
}

/** The optional note that goes in the "ready for your review" email, above the Open button. */
export function ReviewNoteField() {
  return (
    <label className="block">
      <span className="text-sm font-extrabold text-[#243d31]">Add a note for the Content Managers <span className="font-normal text-[#607066]">(optional)</span></span>
      <textarea
        name="note"
        rows={3}
        maxLength={REVIEW_NOTE_MAX_LENGTH}
        placeholder="Instructions or anything you want them to know. Two or three sentences is plenty."
        className="mt-1 block w-full rounded-xl border border-[#284a3b]/20 bg-white px-3 py-2 text-sm leading-6 text-[#243126]"
      />
      <span className="mt-1 block text-xs text-[#607066]">Included in the email each Content Manager receives.</span>
    </label>
  );
}

/** Checkboxes for choosing which Content Managers a send goes to. Everyone listed starts ticked. */
export function ReviewRecipientPicker({ people, legend }: { people: ContentManagerOption[]; legend: string }) {
  if (people.length === 0) return <p className="text-sm font-bold text-[#6b5013]">There are no active Content Managers to send to. Add one under Content Managers first.</p>;
  return (
    <fieldset>
      <legend className="text-sm font-extrabold text-[#243d31]">{legend}</legend>
      <ul className="mt-2 space-y-1">
        {people.map((person) => (
          <li key={person.userId}>
            <label className="flex items-center gap-2 text-sm text-[#243126]">
              <input type="checkbox" name="to" value={person.userId} defaultChecked className="h-4 w-4" />
              {person.name}
            </label>
          </li>
        ))}
      </ul>
    </fieldset>
  );
}

/**
 * The gate: Content Managers see nothing until the Administrator presses Send. One section, used for
 * teachings and devotionals. (Weekly updates have their own sending section on the Weekly Updates page.)
 */
export async function ReviewGateSection({
  noun,
  sentAt,
  sendAction,
  takeBackAction,
  kind,
  subjectId,
}: {
  noun: string;
  sentAt: string | null;
  sendAction: (formData: FormData) => Promise<void>;
  takeBackAction: () => Promise<void>;
  /** With the item's id, lets the box say who has marked it reviewed with no changes. */
  kind?: Exclude<ReviewSubjectKind, "weekly_update">;
  subjectId?: string;
}) {
  // The people who read it and found nothing to change (a Content Manager's "reviewed, no changes needed").
  let reviewedBy: { name: string; at: string }[] = [];
  if (sentAt && kind && subjectId) {
    const supabase = await createClient();
    const { data } = await supabase.from("content_review_oks").select("user_name, ok_at").eq("subject_type", kind).eq("subject_id", subjectId).order("ok_at", { ascending: true });
    reviewedBy = ((data as { user_name: string | null; ok_at: string }[] | null) ?? []).map((row) => ({ name: row.user_name ?? "A Content Manager", at: row.ok_at }));
  }
  // Who it has been sent to, and who it could still be sent to.
  const managers = await listActiveContentManagers();
  const sentTo = new Map<string, string>();
  if (sentAt && kind && subjectId) {
    const supabase = await createClient();
    const { data } = await supabase.from("content_review_recipients").select("user_id, sent_at").eq("subject_type", kind).eq("subject_id", subjectId);
    for (const row of (data as { user_id: string; sent_at: string }[] | null) ?? []) sentTo.set(row.user_id, row.sent_at);
  }
  const notYet = managers.filter((person) => !sentTo.has(person.userId));
  const haveIt = managers.filter((person) => sentTo.has(person.userId));
  return (
    <section id="content-manager-review" className="mt-8 rounded-2xl border border-[#1a4fb4]/20 bg-[#f4f7fe] p-5">
      <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#1a4fb4]">Content Manager review</p>
      {sentAt ? (
        <>
          <h2 className="mt-2 text-2xl font-extrabold text-[#243d31]">With the Content Managers</h2>
          <p className="mt-3 text-sm leading-6 text-[#385245]">
            Sent on {dateFormat.format(new Date(sentAt))}. They can see this {noun} and propose changes. Their proposals appear on the Revisions page, and nothing changes until you accept it.
            While it is with them, anything you save is visible to them, and a proposal written before your edit may show as out of date.
          </p>
          {reviewedBy.length ? (
            <ul className="mt-3 space-y-1 text-sm font-bold text-[#326048]">
              {reviewedBy.map((person) => <li key={person.name + person.at}>{person.name} reviewed it with no changes needed, {dateFormat.format(new Date(person.at))}.</li>)}
            </ul>
          ) : null}
          {haveIt.length ? (
            <ul className="mt-3 space-y-1 text-sm text-[#385245]">
              {haveIt.map((person) => <li key={person.userId}><span className="font-bold text-[#243d31]">{person.name}</span> has it, sent {dateFormat.format(new Date(sentTo.get(person.userId) as string))}.</li>)}
            </ul>
          ) : null}
          {notYet.length ? (
            <form action={sendAction} className="mt-4 space-y-3 rounded-xl border border-[#1a4fb4]/15 bg-white/70 p-4">
              <ReviewRecipientPicker people={notYet} legend="Not sent to yet. Send it to more Content Managers:" />
              <ReviewNoteField />
              <ConfirmButton message={`Send this ${noun} to the selected Content Managers too? It becomes visible to them and each one is emailed. Nobody who already has it is emailed again.`} className="admin-secondary-button">Send to the selected Content Managers</ConfirmButton>
            </form>
          ) : null}
          <form action={takeBackAction} className="mt-4">
            <ConfirmButton message={`Take this ${noun} back from the Content Managers? It disappears from their list. Proposals already submitted stay on the Revisions page for you to decide.`} className="admin-secondary-button">Take back from review</ConfirmButton>
          </form>
        </>
      ) : (
        <>
          <h2 className="mt-2 text-2xl font-extrabold text-[#243d31]">Not sent to the Content Managers</h2>
          <p className="mt-3 text-sm leading-6 text-[#385245]">
            Content Managers cannot see this {noun} while you work on it. When you are satisfied it is ready for their review, send it to the Content Managers you choose. It then appears in their list and each one is emailed a link. You can send it to others later; nobody gets it twice.
          </p>
          <form action={sendAction} className="mt-4 space-y-3">
            <ReviewRecipientPicker people={managers} legend="Send it to:" />
            <ReviewNoteField />
            <ConfirmButton message={`Send this ${noun} to the selected Content Managers for review? It becomes visible to them and each one is emailed.`} className="admin-primary-button"><span>Send to Content Managers for review</span></ConfirmButton>
          </form>
        </>
      )}
    </section>
  );
}
