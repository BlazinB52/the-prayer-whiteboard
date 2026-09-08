"use client";

import { useActionState } from "react";
import type { DevotionalFormState } from "../../devotional-actions";

type Action = (state: DevotionalFormState) => Promise<DevotionalFormState>;

export function CreateDevotionalForm({ action }: { action: Action }) {
  const [state, formAction, isPending] = useActionState(action, {});

  return (
    <form action={formAction} className="mt-5">
      {state.error ? <p role="alert" className="mb-3 text-sm font-bold text-[#a2472c]">{state.error}</p> : null}
      <button type="submit" disabled={isPending} className="admin-primary-button">{isPending ? "Creating..." : "Create 7-Day Devotional"}</button>
    </form>
  );
}
