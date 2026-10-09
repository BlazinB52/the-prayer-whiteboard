"use client";

import { useActionState } from "react";
import { recallSubmittedRevision, type RecallState, type RecallSubject } from "./recall-action";

export function RecallRevisionButton({ subject, subjectId, revisionId, opened }: { subject: RecallSubject; subjectId: string; revisionId: string; opened: boolean }) {
  const [state, formAction, pending] = useActionState(recallSubmittedRevision.bind(null, subject, subjectId, revisionId), {} as RecallState);

  if (opened) {
    return <p className="rounded-xl border border-[#284a3b]/10 bg-[#f4efe5] px-4 py-3 text-sm leading-6 text-[#607066]">An Administrator has started reviewing this, so it can no longer be taken back.</p>;
  }

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (!window.confirm("Take this back to continue editing? It will leave the Administrator's list until you submit it again.")) event.preventDefault();
      }}
    >
      {state.error ? <p role="alert" className="mb-2 text-sm font-bold text-[#a2472c]">{state.error}</p> : null}
      <button type="submit" disabled={pending} className="admin-primary-button">{pending ? "Taking back..." : "Take back and keep editing"}</button>
      <p className="mt-2 text-xs text-[#607066]">Available until an Administrator opens it for review.</p>
    </form>
  );
}
