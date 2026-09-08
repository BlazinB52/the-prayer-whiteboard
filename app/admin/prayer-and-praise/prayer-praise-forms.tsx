"use client";

import { useActionState, useState } from "react";
import {
  PRAYER_AND_PRAISE_CATEGORIES,
  PRIVACY_SUMMARY_HELPER_TEXT,
  PUBLIC_SUMMARY_MAX_LENGTH,
  type PrayerPraiseCategory,
  type PrayerNeed,
  type PraiseReport,
} from "@/lib/prayer-and-praise";
import type { PrayerPraiseActionState } from "./actions";

type FormState = { error?: string; saved?: boolean };
type FormAction = (state: FormState, formData: FormData) => Promise<FormState>;
type ButtonAction = (state: PrayerPraiseActionState) => Promise<PrayerPraiseActionState>;
type DeleteAction = (state: PrayerPraiseActionState, formData: FormData) => Promise<PrayerPraiseActionState>;

export function PrayerRecordForm({ prayer, action }: { prayer?: PrayerNeed; action: FormAction }) {
  const [values, setValues] = useState({
    category: prayer?.category ?? PRAYER_AND_PRAISE_CATEGORIES[0],
    publicSummary: prayer?.public_summary ?? "",
  });
  const [state, formAction, isPending] = useActionState(action, {});

  return (
    <form action={formAction} className="space-y-4">
      <CategorySelect value={values.category} onChange={(category) => setValues((current) => ({ ...current, category }))} />
      <SummaryTextarea value={values.publicSummary} onChange={(publicSummary) => setValues((current) => ({ ...current, publicSummary }))} />
      {state.error ? <p role="alert" className="text-sm font-bold text-[#a2472c]">{state.error}</p> : null}
      {state.saved ? <p role="status" className="text-sm font-bold text-[#326048]">Prayer point saved.</p> : null}
      <button type="submit" disabled={isPending} className="admin-primary-button">{isPending ? "Saving..." : prayer ? "Save Prayer Point" : "Create Prayer Point"}</button>
    </form>
  );
}

export function PraiseRecordForm({ praise, action }: { praise?: PraiseReport; action: FormAction }) {
  const [values, setValues] = useState({
    category: praise?.category ?? PRAYER_AND_PRAISE_CATEGORIES[0],
    publicSummary: praise?.public_summary ?? "",
  });
  const [state, formAction, isPending] = useActionState(action, {});

  return (
    <form action={formAction} className="space-y-4">
      <CategorySelect value={values.category} onChange={(category) => setValues((current) => ({ ...current, category }))} />
      <SummaryTextarea value={values.publicSummary} onChange={(publicSummary) => setValues((current) => ({ ...current, publicSummary }))} />
      {state.error ? <p role="alert" className="text-sm font-bold text-[#a2472c]">{state.error}</p> : null}
      {state.saved ? <p role="status" className="text-sm font-bold text-[#326048]">Praise report saved.</p> : null}
      <button type="submit" disabled={isPending} className="admin-primary-button">{isPending ? "Saving..." : praise ? "Save Praise Report" : "Create Praise Report"}</button>
    </form>
  );
}

export function ConfirmActionButton({ action, label, pendingLabel, confirmation, variant = "secondary" }: { action: ButtonAction; label: string; pendingLabel: string; confirmation?: string; variant?: "primary" | "secondary" | "danger" }) {
  const [state, formAction, isPending] = useActionState(action, {});
  const className = variant === "primary" ? "admin-primary-button" : variant === "danger" ? "admin-danger-button" : "admin-secondary-button";

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (confirmation && !window.confirm(confirmation)) {
          event.preventDefault();
        }
      }}
    >
      {state.error ? <p role="alert" className="mb-2 text-sm font-bold text-[#a2472c]">{state.error}</p> : null}
      <button type="submit" disabled={isPending} className={className}>{isPending ? pendingLabel : label}</button>
    </form>
  );
}

export function DeleteRecordForm({ action, label, pendingLabel }: { action: DeleteAction; label: string; pendingLabel: string }) {
  const [state, formAction, isPending] = useActionState(action, {});

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (!window.confirm("This permanently deletes the record. Continue?")) {
          event.preventDefault();
        }
      }}
      className="flex flex-col gap-2"
    >
      <input name="confirmation" placeholder="Type DELETE" className="admin-input mt-0 max-w-44 text-sm" />
      {state.error ? <p role="alert" className="text-sm font-bold text-[#a2472c]">{state.error}</p> : null}
      <button type="submit" disabled={isPending} className="admin-danger-button">{isPending ? pendingLabel : label}</button>
    </form>
  );
}

function CategorySelect({ value, onChange }: { value: PrayerPraiseCategory; onChange: (value: PrayerPraiseCategory) => void }) {
  return (
    <label className="block text-sm font-bold text-[#385245]">
      Category
      <select name="category" value={value} onChange={(event) => onChange(event.target.value as PrayerPraiseCategory)} className="admin-input">
        {PRAYER_AND_PRAISE_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
      </select>
    </label>
  );
}

function SummaryTextarea({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <label className="block text-sm font-bold text-[#385245]">
      Public summary
      <span className="block text-xs font-normal leading-5 text-[#607066]">{PRIVACY_SUMMARY_HELPER_TEXT}</span>
      <textarea name="publicSummary" value={value} onChange={(event) => onChange(event.target.value)} maxLength={PUBLIC_SUMMARY_MAX_LENGTH} rows={4} className="admin-input resize-y py-3" />
    </label>
  );
}
