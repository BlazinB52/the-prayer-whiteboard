"use client";

import { useActionState, useState } from "react";
import { FormattedTextarea } from "@/app/admin/formatted-textarea";
import type { DevotionalFormState, DevotionalImportState } from "@/app/admin/devotionals/actions";

type Action = (state: DevotionalFormState, formData: FormData) => Promise<DevotionalFormState>;

export function CreateStandaloneDevotionalForm({ action }: { action: Action }) {
  const [values, setValues] = useState({ title: "", introduction: "", language: "en" });
  const [state, formAction, isPending] = useActionState(action, {});

  return (
    <form action={formAction} className="mt-6 space-y-5">
      <label className="block text-sm font-bold text-[#385245]">
        Language
        <select name="language" value={values.language} onChange={(event) => setValues((current) => ({ ...current, language: event.target.value }))} className="admin-input">
          <option value="en">English</option>
          <option value="es">Español</option>
        </select>
        <span className="mt-1 block text-xs font-normal leading-5 text-[#607066]">Español devotionals appear on the Español homepage and are not emailed to subscribers automatically.</span>
      </label>
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

type FileAction = (state: DevotionalImportState, formData: FormData) => Promise<DevotionalImportState>;

// The usual way to start a devotional: the language and the prepared text file. The title, introduction
// and all seven days come from the file, so nothing is typed twice.
export function CreateDevotionalFromFileForm({ action }: { action: FileAction }) {
  const [state, formAction, isPending] = useActionState(action, {});

  return (
    <form action={formAction} className="mt-6 space-y-5">
      <label className="block text-sm font-bold text-[#385245]">
        Language
        <select name="language" defaultValue="en" className="admin-input">
          <option value="en">English</option>
          <option value="es">Español</option>
        </select>
        <span className="mt-1 block text-xs font-normal leading-5 text-[#607066]">Español devotionals appear on the Español homepage and are not emailed to subscribers automatically.</span>
      </label>
      <label className="block text-sm font-bold text-[#385245]">
        Devotional text file <span className="text-[#a2472c]">*</span>
        <span className="mt-1 block text-xs font-normal leading-5 text-[#607066]">A plain .txt file. The devotional title, introduction and all seven days are read from it, and the devotional is saved as a draft.</span>
        <input name="devotionalFile" type="file" accept=".txt,text/plain" required disabled={isPending} className="admin-input py-2" />
      </label>
      <label className="flex items-start gap-3 text-sm font-bold text-[#385245]">
        <input type="checkbox" name="linkSource" defaultChecked disabled={isPending} className="mt-1 h-4 w-4" />
        <span>If this file was exported from an existing devotional, link the new one to it as its translation. <span className="block text-xs font-normal leading-5 text-[#607066]">Only used when the file names its source and the two are in different languages. The two public pages then point to each other once both are published.</span></span>
      </label>
      {state.error ? <p role="alert" className="text-sm font-bold text-[#a2472c]">{state.error}</p> : null}
      <button type="submit" disabled={isPending} className="admin-primary-button">{isPending ? "Creating..." : "Create Devotional From File"}</button>
    </form>
  );
}
