"use client";

import { useActionState, useRef, useEffect } from "react";
import type { ContentManagerActionState } from "./actions";

type FormAction = (state: ContentManagerActionState, formData: FormData) => Promise<ContentManagerActionState>;
type ButtonAction = (state: ContentManagerActionState) => Promise<ContentManagerActionState>;

export function InviteForm({ action }: { action: FormAction }) {
  const [state, formAction, isPending] = useActionState(action, {});
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.message) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-bold text-[#385245]">
          Name
          <input name="name" type="text" autoComplete="off" maxLength={120} required className="admin-input" />
        </label>
        <label className="block text-sm font-bold text-[#385245]">
          Personal email
          <input name="email" type="email" autoComplete="off" maxLength={254} required className="admin-input" />
        </label>
      </div>
      {state.error ? <p role="alert" className="text-sm font-bold text-[#a2472c]">{state.error}</p> : null}
      {state.message ? <p role="status" className="text-sm font-bold text-[#326048]">{state.message}</p> : null}
      <button type="submit" disabled={isPending} className="admin-primary-button">{isPending ? "Sending invite..." : "Invite"}</button>
    </form>
  );
}

export function RowActionButton({ action, label, pendingLabel, confirmation, variant = "secondary" }: { action: ButtonAction; label: string; pendingLabel: string; confirmation?: string; variant?: "secondary" | "danger" }) {
  const [state, formAction, isPending] = useActionState(action, {});
  const className = variant === "danger" ? "admin-danger-button" : "admin-secondary-button";

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (confirmation && !window.confirm(confirmation)) {
          event.preventDefault();
        }
      }}
      className="flex flex-col gap-2"
    >
      <button type="submit" disabled={isPending} className={className}>{isPending ? pendingLabel : label}</button>
      {state.error ? <p role="alert" className="max-w-56 text-sm font-bold text-[#a2472c]">{state.error}</p> : null}
      {state.message ? <p role="status" className="max-w-56 text-sm font-bold text-[#326048]">{state.message}</p> : null}
    </form>
  );
}
