"use client";

import { useActionState } from "react";

type FormState = { error?: string; saved?: boolean };
type Action = (state: FormState) => Promise<FormState>;

export function ArchiveFooterButton({ action }: { action: Action }) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="space-y-2">
      <button type="submit" disabled={pending} className="admin-secondary-button"><span>{pending ? "Archiving..." : "Archive footer"}</span></button>
      {state.error ? <p role="alert" className="text-sm font-bold text-[#a2472c]">{state.error}</p> : null}
      {state.saved ? <p role="status" className="text-sm font-bold text-[#326048]">Footer archived.</p> : null}
    </form>
  );
}
