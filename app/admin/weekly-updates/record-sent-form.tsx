"use client";

import { useActionState } from "react";

type FormState = { error?: string; saved?: boolean };
type Action = (state: FormState, formData: FormData) => Promise<FormState>;

// Records a weekly update that already went out. Nothing is emailed or published.
export function RecordSentForm({ action }: { action: Action }) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="grid gap-4 sm:grid-cols-3">
      <label className="block text-sm font-bold text-[#385245]">
        Language
        <select name="language" defaultValue="en" className="admin-input">
          <option value="en">English</option>
          <option value="es">Español (El Salvador)</option>
        </select>
      </label>
      <label className="block text-sm font-bold text-[#385245]">
        Gathering date
        <input name="gatheringDate" type="date" required className="admin-input" />
      </label>
      <label className="block text-sm font-bold text-[#385245]">
        Date it was sent
        <input name="sentOn" type="date" className="admin-input" />
        <span className="mt-1 block text-xs font-normal text-[#607066]">Leave empty to use the gathering date.</span>
      </label>
      <div className="sm:col-span-3">
        {state.error ? <p role="alert" className="mb-3 text-sm font-bold text-[#a2472c]">{state.error}</p> : null}
        {state.saved ? <p role="status" className="mb-3 text-sm font-bold text-[#326048]">Recorded as sent. Add another, or leave this open and check the list below.</p> : null}
        <button type="submit" disabled={pending} className="admin-secondary-button">{pending ? "Recording..." : "Record as already sent"}</button>
      </div>
    </form>
  );
}
