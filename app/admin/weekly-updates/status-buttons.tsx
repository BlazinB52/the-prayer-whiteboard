"use client";

import { useActionState } from "react";
import type { WeeklyUpdateActionState } from "./actions";

type Action = (state: WeeklyUpdateActionState, formData: FormData) => Promise<WeeklyUpdateActionState>;

export function WeeklyUpdateStatusButton({ action, weeklyUpdateId, intent, label, variant = "primary" }: { action: Action; weeklyUpdateId: string; intent: "publish" | "archive"; label: string; variant?: "primary" | "danger" }) {
  const [state, formAction, pending] = useActionState(action, {});
  const className = variant === "danger"
    ? "min-h-11 rounded-xl bg-[#a2472c] px-5 font-extrabold text-white transition hover:bg-[#8f3823] disabled:cursor-not-allowed disabled:opacity-60"
    : "admin-primary-button";

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="weeklyUpdateId" value={weeklyUpdateId} />
      <input type="hidden" name="intent" value={intent} />
      <button type="submit" disabled={pending} className={className}><span className="!text-white">{pending ? "Working..." : label}</span></button>
      {state.error ? <p role="alert" className="text-sm font-bold text-[#a2472c]">{state.error}</p> : null}
    </form>
  );
}
