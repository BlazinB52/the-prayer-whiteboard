"use client";

import { useActionState, useState } from "react";
import type { DeleteTeachingState } from "./actions";

type Action = (state: DeleteTeachingState, formData: FormData) => Promise<DeleteTeachingState>;

const warning =
  "Permanently delete this teaching? This will delete the teaching, all categories, sections, chalkboard associations, and associated chalkboard files. This action cannot be undone.";

export function DeleteTeachingButton({ action }: { action: Action }) {
  const [confirmation, setConfirmation] = useState("");
  const [state, formAction, isPending] = useActionState(action, {});
  const canDelete = confirmation === "DELETE";

  return (
    <form action={formAction} className="mt-4 space-y-4">
      <p className="text-sm font-bold leading-6 text-[#8b3822]">{warning}</p>
      <label className="block text-sm font-bold text-[#385245]">
        Type DELETE to confirm
        <input
          name="confirmation"
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          autoComplete="off"
          className="admin-input"
        />
      </label>
      {state.error ? <p role="alert" className="text-sm font-bold text-[#a2472c]">{state.error}</p> : null}
      <button
        type="submit"
        disabled={!canDelete || isPending}
        className="inline-flex min-h-12 items-center justify-center rounded-xl bg-[#a2472c] px-5 font-extrabold text-white transition hover:bg-[#8b3822] hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className="!text-white">{isPending ? "Deleting..." : "Delete teaching"}</span>
      </button>
    </form>
  );
}
