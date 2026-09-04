"use client";

import { useActionState } from "react";
import type { UnpublishTeachingState } from "./actions";

type Action = (state: UnpublishTeachingState) => Promise<UnpublishTeachingState>;

export function UnpublishButton({ action }: { action: Action }) {
  const [state, formAction, isPending] = useActionState(action, {});

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (!window.confirm("Unpublish this teaching and return it to draft?")) {
          event.preventDefault();
        }
      }}
      className="mt-4"
    >
      {state.error ? <p role="alert" className="mb-3 text-sm font-bold text-[#a2472c]">{state.error}</p> : null}
      <button
        type="submit"
        disabled={isPending}
        className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[#a2472c]/30 bg-white px-5 font-extrabold text-[#a2472c] transition hover:border-[#a2472c] hover:text-[#8b3822] disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span>{isPending ? "Unpublishing..." : "Unpublish"}</span>
      </button>
    </form>
  );
}
