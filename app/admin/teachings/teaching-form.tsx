"use client";

import { useActionState } from "react";

type TeachingValues = {
  title: string;
  gatheringDate: string;
  centralTheme: string;
  introduction: string;
  summary: string;
};

type FormState = { error?: string; saved?: boolean };
type Action = (state: FormState, formData: FormData) => Promise<FormState>;

export function TeachingForm({ values, action }: { values: TeachingValues; action: Action }) {
  const [state, formAction, isPending] = useActionState(action, {});

  return (
    <form action={formAction} className="mt-8 space-y-6">
      <label className="block text-sm font-bold text-[#385245]">
        Title <span className="text-[#a2472c]">*</span>
        <input name="title" defaultValue={values.title} required maxLength={160} className="admin-input" />
      </label>
      <label className="block text-sm font-bold text-[#385245]">
        Gathering date
        <input name="gatheringDate" type="date" defaultValue={values.gatheringDate} className="admin-input" />
      </label>
      <label className="block text-sm font-bold text-[#385245]">
        Central theme
        <input name="centralTheme" defaultValue={values.centralTheme} maxLength={240} className="admin-input" />
      </label>
      <label className="block text-sm font-bold text-[#385245]">
        Introduction
        <textarea name="introduction" defaultValue={values.introduction} maxLength={5000} rows={6} className="admin-input resize-y py-3" />
      </label>
      <label className="block text-sm font-bold text-[#385245]">
        Short summary
        <textarea name="summary" defaultValue={values.summary} maxLength={500} rows={4} className="admin-input resize-y py-3" />
      </label>
      {state.error ? <p role="alert" className="text-sm font-bold text-[#a2472c]">{state.error}</p> : null}
      {state.saved ? <p role="status" className="text-sm font-bold text-[#326048]">Draft saved.</p> : null}
      <div className="flex flex-col gap-3 sm:flex-row">
        <button type="submit" disabled={isPending} className="min-h-12 rounded-xl bg-[#244a3a] px-6 font-extrabold text-white transition hover:bg-[#1d3d30] hover:text-white disabled:cursor-not-allowed disabled:opacity-60">
          <span className="!text-white">{isPending ? "Saving..." : "Save Draft"}</span>
        </button>
        <button type="submit" name="saveAction" value="return" disabled={isPending} className="min-h-12 rounded-xl bg-[#244a3a] px-6 font-extrabold text-white transition hover:bg-[#1d3d30] hover:text-white disabled:cursor-not-allowed disabled:opacity-60">
          <span className="!text-white">Save &amp; Return to Teachings</span>
        </button>
      </div>
    </form>
  );
}
