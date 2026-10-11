import { ConfirmButton } from "@/app/admin/teaching-revisions/confirm-button";

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "America/Chicago" });

export function ReviewGateMessage({ review, mailed, of }: { review?: string; mailed?: string; of?: string }) {
  if (!review) return null;
  const ok = "mt-6 rounded-xl border border-[#326048]/20 bg-[#e7efe9] px-4 py-3 text-sm font-bold text-[#326048]";
  const warn = "mt-6 rounded-xl border border-[#c49a3a]/40 bg-[#fbf4e1] px-4 py-3 text-sm font-bold text-[#6b5013]";
  const bad = "mt-6 rounded-xl border border-[#a2472c]/30 bg-[#f7e6e1] px-4 py-3 text-sm font-bold text-[#a2472c]";
  if (review === "sent") return <p role="status" className={ok}>Sent to the Content Managers. {mailed ? `${mailed} of ${of} were emailed.` : ""}</p>;
  if (review === "partial") return <p role="alert" className={warn}>Sent to the Content Managers, but only {mailed} of {of} emails went out. They can still see it when they sign in; please tell the others directly.</p>;
  if (review === "nocm") return <p role="alert" className={warn}>Sent, but there are no active Content Managers with an email address to notify.</p>;
  if (review === "takenback") return <p role="status" className={ok}>Taken back. Content Managers can no longer see it. Proposals they already submitted are still waiting on the Revisions page.</p>;
  if (review === "already") return <p role="status" className={ok}>It was already sent, so nobody was emailed again.</p>;
  return <p role="alert" className={bad}>That could not be changed. Only a draft can be sent for review.</p>;
}

/**
 * The gate: Content Managers see nothing until the Administrator presses Send. One section, used for
 * teachings and devotionals. (Weekly updates have their own sending section on the Weekly Updates page.)
 */
export function ReviewGateSection({
  noun,
  sentAt,
  sendAction,
  takeBackAction,
}: {
  noun: string;
  sentAt: string | null;
  sendAction: () => Promise<void>;
  takeBackAction: () => Promise<void>;
}) {
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
          <form action={takeBackAction} className="mt-4">
            <ConfirmButton message={`Take this ${noun} back from the Content Managers? It disappears from their list. Proposals already submitted stay on the Revisions page for you to decide.`} className="admin-secondary-button">Take back from review</ConfirmButton>
          </form>
        </>
      ) : (
        <>
          <h2 className="mt-2 text-2xl font-extrabold text-[#243d31]">Not sent to the Content Managers</h2>
          <p className="mt-3 text-sm leading-6 text-[#385245]">
            Content Managers cannot see this {noun} while you work on it. When you are satisfied it is ready for their review, send it. It then appears in their list and each active Content Manager is emailed a link.
          </p>
          <form action={sendAction} className="mt-4">
            <ConfirmButton message={`Send this ${noun} to the Content Managers for review? It becomes visible to them and each one is emailed.`} className="admin-primary-button"><span>Send to Content Managers for review</span></ConfirmButton>
          </form>
        </>
      )}
    </section>
  );
}
