"use client";

import { useActionState } from "react";
import type { SubscriberActionState } from "./actions";

export function SubscriberActionButton({
  action,
  subscriberId,
  label,
  pendingLabel,
}: {
  action: (previous: SubscriberActionState, formData: FormData) => Promise<SubscriberActionState>;
  subscriberId: string;
  label: string;
  pendingLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="mt-2">
      <input type="hidden" name="subscriberId" value={subscriberId} />
      {state.needsConfirm ? (
        <>
          <p role="status" className="mb-1 text-xs font-bold text-[#7a4a1d]">{state.message}</p>
          <button type="submit" name="confirmRemovals" value="yes" disabled={pending} className="admin-primary-button min-h-9 px-3 py-1 text-xs disabled:opacity-60">
            {pending ? pendingLabel : "Apply these changes"}
          </button>
        </>
      ) : (
        <button type="submit" disabled={pending} className="admin-secondary-button min-h-9 px-3 py-1 text-xs disabled:opacity-60">
          {pending ? pendingLabel : label}
        </button>
      )}
      {state.error ? <p role="alert" className="mt-1 text-xs font-bold text-[#a2472c]">{state.error}</p> : null}
      {!state.needsConfirm && state.message ? <p role="status" className="mt-1 text-xs font-bold text-[#326048]">{state.message}</p> : null}
    </form>
  );
}
