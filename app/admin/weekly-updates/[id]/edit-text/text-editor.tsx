"use client";

import { useActionState, useState } from "react";
import { FormattedTextarea } from "@/app/admin/formatted-textarea";
import type { EditTextState } from "./actions";

export type TextEditorField = {
  key: string;
  label: string;
  value: string;
  rows: number;
  maxLength: number;
  formatted: boolean;
  multiline: boolean;
};

type Action = (state: EditTextState, formData: FormData) => Promise<EditTextState>;

export function WeeklyUpdateTextEditor({ action, fields }: { action: Action; fields: TextEditorField[] }) {
  const [state, formAction, pending] = useActionState(action, {});
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(fields.map((field) => [field.key, field.value])));
  // What each field said when it was last loaded or saved, sent back so the database can tell if it has
  // changed since. After a successful save, what was just saved becomes the new starting point.
  const [bases, setBases] = useState<Record<string, string>>(() => Object.fromEntries(fields.map((field) => [field.key, field.value])));
  const [handledState, setHandledState] = useState(state);
  if (state !== handledState) {
    setHandledState(state);
    if (state.savedCount !== undefined) setBases(values);
  }
  const changedCount = fields.filter((field) => values[field.key] !== bases[field.key]).length;

  return (
    <form action={formAction} id="editor" className="mt-6 scroll-mt-6 space-y-5">
      <h2 className="text-xl font-extrabold text-[#243d31]">Edit the text</h2>
      {fields.map((field) => {
        const changed = values[field.key] !== bases[field.key];
        return (
          <div key={field.key} id={`field-${field.key}`} className={`scroll-mt-6 rounded-2xl border bg-[#fffdf8] p-4 ${changed ? "border-[#1a4fb4]/40" : "border-[#284a3b]/10"}`}>
            <input type="hidden" name={`base:${field.key}`} value={bases[field.key]} />
            {field.formatted ? (
              <FormattedTextarea
                label={field.label}
                name={`value:${field.key}`}
                value={values[field.key]}
                onValueChange={(next) => setValues((current) => ({ ...current, [field.key]: next }))}
                rows={field.rows}
                maxLength={field.maxLength}
                bullets={false}
              />
            ) : field.multiline ? (
              <label className="block text-sm font-bold text-[#385245]">
                {field.label}
                <textarea name={`value:${field.key}`} value={values[field.key]} onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.value }))} rows={field.rows} maxLength={field.maxLength} className="admin-input resize-y py-3" />
              </label>
            ) : (
              <label className="block text-sm font-bold text-[#385245]">
                {field.label}
                <input name={`value:${field.key}`} value={values[field.key]} onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.value }))} maxLength={field.maxLength} className="admin-input" />
              </label>
            )}
            {changed ? <p className="mt-2 text-xs font-extrabold uppercase tracking-wider text-[#1a4fb4]">Edited, not saved yet</p> : null}
          </div>
        );
      })}

      <div className="sticky bottom-0 -mx-1 rounded-2xl border border-[#a85e32]/20 bg-[#fff8f1] p-4 shadow-xl shadow-[#4d5f52]/10">
        {state.error ? <p role="alert" className="mb-3 text-sm font-bold text-[#a2472c]">{state.error}</p> : null}
        {state.savedCount !== undefined && changedCount === 0 ? <p role="status" className="mb-3 text-sm font-bold text-[#326048]">Saved ({state.savedCount} {state.savedCount === 1 ? "paragraph" : "paragraphs"} changed). Nothing was published or emailed.</p> : null}
        <p className="mb-3 text-sm leading-6 text-[#607066]">Changes are saved to the draft only. Nothing is published or emailed until you publish.</p>
        <button type="submit" disabled={pending || changedCount === 0} className="admin-primary-button">
          <span>{pending ? "Saving..." : `Save ${changedCount} ${changedCount === 1 ? "change" : "changes"}`}</span>
        </button>
      </div>
    </form>
  );
}
