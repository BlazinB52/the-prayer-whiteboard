"use client";

import { useActionState } from "react";
import type { DevotionalAssignmentState } from "../../devotional-actions";

type AssignAction = (state: DevotionalAssignmentState, formData: FormData) => Promise<DevotionalAssignmentState>;
type RemoveAction = (state: DevotionalAssignmentState) => Promise<DevotionalAssignmentState>;

type DevotionalOption = {
  id: string;
  title: string;
  status: string;
};

export function DevotionalAssignmentForm({
  devotionals,
  currentDevotionalId,
  assignAction,
  removeAction,
}: {
  devotionals: DevotionalOption[];
  currentDevotionalId: string | null;
  assignAction: AssignAction;
  removeAction: RemoveAction;
}) {
  const [assignState, assignFormAction, assignPending] = useActionState(assignAction, {});
  const [removeState, removeFormAction, removePending] = useActionState(removeAction, {});
  const current = devotionals.find((devotional) => devotional.id === currentDevotionalId);

  return (
    <section className="mt-8 rounded-2xl border border-[#284a3b]/10 bg-[#fffdf8] p-6">
      <h2 className="text-2xl font-extrabold text-[#243d31]">Use Existing Devotional</h2>
      <p className="mt-3 text-sm leading-6 text-[#607066]">
        Currently assigned: <span className="font-extrabold text-[#385245]">{current?.title ?? "None"}</span>
      </p>
      {devotionals.length ? (
        <form action={assignFormAction} className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-end">
          <label className="flex-1 text-sm font-bold text-[#385245]">
            Existing devotional
            <select name="devotionalId" defaultValue={currentDevotionalId ?? ""} required className="admin-input">
              <option value="" disabled>Choose a devotional</option>
              {devotionals.map((devotional) => (
                <option key={devotional.id} value={devotional.id}>{devotional.title} ({devotional.status})</option>
              ))}
            </select>
          </label>
          <button type="submit" disabled={assignPending} className="admin-primary-button">
            {assignPending ? "Assigning..." : "Assign Devotional"}
          </button>
          {assignState.error ? <p role="alert" className="text-sm font-bold text-[#a2472c]">{assignState.error}</p> : null}
        </form>
      ) : (
        <p className="mt-4 text-sm leading-6 text-[#607066]">No existing devotionals are available.</p>
      )}
      {currentDevotionalId ? (
        <form
          action={removeFormAction}
          onSubmit={(event) => {
            if (!window.confirm("Remove this devotional from the teaching? The devotional and its content will not be deleted.")) event.preventDefault();
          }}
          className="mt-5 border-t border-[#284a3b]/10 pt-5"
        >
          {removeState.error ? <p role="alert" className="mb-3 text-sm font-bold text-[#a2472c]">{removeState.error}</p> : null}
          <button type="submit" disabled={removePending} className="admin-secondary-button">
            {removePending ? "Removing..." : "Remove Association"}
          </button>
        </form>
      ) : null}
    </section>
  );
}
