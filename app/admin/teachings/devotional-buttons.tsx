"use client";

import { useActionState } from "react";
import type { DevotionalPublishState } from "./devotional-actions";

type Action = (state: DevotionalPublishState) => Promise<DevotionalPublishState>;

export function PublishDevotionalButton({ action }: { action: Action }) {
  const [state, formAction, isPending] = useActionState(action, {});

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (!window.confirm("Publish this 7-Day Devotional now? It will become public only while the teaching is also published.")) {
          event.preventDefault();
        }
      }}
    >
      {state.error ? <p role="alert" className="mb-3 text-sm font-bold text-[#a2472c]">{state.error}</p> : null}
      <button type="submit" disabled={isPending} className="admin-primary-button">
        {isPending ? "Publishing..." : "Publish Devotional"}
      </button>
    </form>
  );
}

export function UnpublishDevotionalButton({ action }: { action: Action }) {
  const [state, formAction, isPending] = useActionState(action, {});

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (!window.confirm("Unpublish this devotional and return only the devotional to draft?")) {
          event.preventDefault();
        }
      }}
    >
      {state.error ? <p role="alert" className="mb-3 text-sm font-bold text-[#a2472c]">{state.error}</p> : null}
      <button type="submit" disabled={isPending} className="admin-danger-button">
        {isPending ? "Unpublishing..." : "Unpublish Devotional"}
      </button>
    </form>
  );
}
