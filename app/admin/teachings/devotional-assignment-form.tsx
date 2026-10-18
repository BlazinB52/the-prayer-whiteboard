"use client";

import { useActionState } from "react";
import type { DevotionalAssignmentState } from "@/app/admin/devotionals/actions";

type AssignAction = (state: DevotionalAssignmentState, formData: FormData) => Promise<DevotionalAssignmentState>;
type RemoveAction = (state: DevotionalAssignmentState) => Promise<DevotionalAssignmentState>;

type DevotionalOption = {
  id: string;
  title: string;
  status: string;
  /** The gathering date of the teaching the devotional belongs to, as shown ("Oct 10, 2026"). */
  dateLabel: string;
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

  return (
    <div>
      {devotionals.length ? (
        <form action={assignFormAction} className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end">
          <label className="flex-1 text-sm font-bold text-[#385245]">
            Devotional
            <select name="devotionalId" defaultValue={currentDevotionalId ?? ""} required className="admin-input">
              <option value="" disabled>Choose a devotional</option>
              {devotionals.map((devotional) => (
                <option key={devotional.id} value={devotional.id}>{devotional.dateLabel} · {devotional.title} ({devotional.status})</option>
              ))}
            </select>
          </label>
          <button type="submit" disabled={assignPending} className="admin-primary-button">
            {assignPending ? "Assigning..." : "Assign"}
          </button>
          {assignState.error ? <p role="alert" className="text-sm font-bold text-[#a2472c]">{assignState.error}</p> : null}
        </form>
      ) : (
        <p className="mt-4 text-sm leading-6 text-[#607066]">No devotionals are available to attach yet.</p>
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
            {removePending ? "Removing..." : "Remove from this teaching"}
          </button>
        </form>
      ) : null}
    </div>
  );
}
