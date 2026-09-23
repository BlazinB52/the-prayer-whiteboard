"use client";

import { useActionState, useState } from "react";
import { FormattedTextarea } from "@/app/admin/formatted-textarea";
import type { DevotionalFormState } from "@/app/admin/teachings/devotional-actions";

type Action = (state: DevotionalFormState, formData: FormData) => Promise<DevotionalFormState>;

export function CreateStandaloneDevotionalForm({ action }: { action: Action }) {
  const [values, setValues] = useState({ title: "", introduction: "" });
  const [state, formAction, isPending] = useActionState(action, {});

  return (
    <form action={formAction} className="mt-6 space-y-5">
      <label className="block text-sm font-bold text-[#385245]">
        Devotional title <span className="text-[#a2472c]">*</span>
        <span className="mt-1 block text-xs font-normal leading-5 text-[#607066]">A working title is fine. It becomes the provisional web address and can be changed before the devotional is published.</span>
        <input
          name="title"
          value={values.title}
          onChange={(event) => setValues((current) => ({ ...current, title: event.target.value }))}
          maxLength={180}
          required
          autoFocus
          className="admin-input"
        />
      </label>
      <FormattedTextarea
        label="Description"
        name="introduction"
        value={values.introduction}
        onValueChange={(value) => setValues((current) => ({ ...current, introduction: value }))}
        maxLength={8000}
        rows={7}
      />
      {state.error ? <p role="alert" className="text-sm font-bold text-[#a2472c]">{state.error}</p> : null}
      <button type="submit" disabled={isPending || !values.title.trim()} className="admin-primary-button">
        {isPending ? "Creating..." : "Create Devotional"}
      </button>
    </form>
  );
}
