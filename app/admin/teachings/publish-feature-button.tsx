"use client";

import { useActionState } from "react";
import type { PublishTeachingState } from "./actions";

type Action = (state: PublishTeachingState) => Promise<PublishTeachingState>;

const confirmationMessage = [
  "This teaching will become publicly available.",
  "It will replace the currently featured homepage teaching.",
  "The previous featured teaching will remain published and available under Previous Gatherings.",
  "",
  "Publish and feature this teaching now?",
].join("\n");

export function PublishFeatureButton({ action }: { action: Action }) {
  const [state, formAction, isPending] = useActionState(action, {});

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (!window.confirm(confirmationMessage)) {
          event.preventDefault();
        }
      }}
      className="mt-4"
    >
      {state.error ? <p role="alert" className="mb-3 text-sm font-bold text-[#a2472c]">{state.error}</p> : null}
      <button
        type="submit"
        disabled={isPending}
        className="inline-flex min-h-12 items-center justify-center rounded-xl bg-[#a85e32] px-5 font-extrabold text-white transition hover:bg-[#8f4f2a] hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className="!text-white">{isPending ? "Publishing..." : "Publish and Feature on Homepage"}</span>
      </button>
    </form>
  );
}
