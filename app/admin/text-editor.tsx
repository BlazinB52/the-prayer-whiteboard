"use client";

import { usePathname, useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";
import { FormattedTextarea } from "@/app/admin/formatted-textarea";
import { useProofed } from "@/app/admin/use-my-place";

export type TextEditorField = {
  key: string;
  label: string;
  value: string;
  rows: number;
  maxLength: number;
  formatted: boolean;
  multiline: boolean;
};

// What the Administrator's direct-edit actions answer with (weekly updates and teaching outlines).
export type EditTextState = { error?: string; savedCount?: number };

type Action = (state: EditTextState, formData: FormData) => Promise<EditTextState>;

// The Administrator edits the wording of a draft directly. Shared by every kind of item that supports it, so
// the screen behaves the same everywhere. unit names what one field is, for the "saved" message.
//
// structureAction (optional) adds Delete and "Add below" buttons to every paragraph and list item. They change
// the shape of the document, so they act on what is saved and are turned off while there are unsaved edits.
// It must be a server action: a page cannot hand a client component any other kind of function.
export type StructureAction = (kind: "insert" | "delete", fieldKey: string) => Promise<{ error?: string }>;
// listAction (optional, outlines only) adds an "Add bullet list below" button that starts a new bullet list after the block.
export type ListAction = (fieldKey: string) => Promise<{ error?: string }>;
const STRUCTURE_FIELD = /^block_[0-9]+(_item_[0-9]+)?$/;

export function AdminTextEditor({ action, fields, unit = "paragraph", structureAction, listAction }: { action: Action; fields: TextEditorField[]; unit?: string; structureAction?: StructureAction; listAction?: ListAction }) {
  const router = useRouter();
  const pathname = usePathname();
  const { proofed, toggle: setProofed } = useProofed(`admin-place:${pathname}`);
  const [structurePending, startStructure] = useTransition();
  const [structureError, setStructureError] = useState<string | null>(null);
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

  // "My Place": the last field marked, in reading order, is where to pick up next time.
  const placeIndex = fields.reduce((last, field, index) => (proofed.has(field.key) ? index : last), -1);
  const jumpToMyPlace = () => {
    if (placeIndex >= 0) document.getElementById(`field-${fields[placeIndex].key}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const changeStructure = (kind: "insert" | "delete", fieldKey: string) => {
    if (!structureAction) return;
    if (kind === "delete" && !window.confirm("Delete this? This cannot be undone here.")) return;
    setStructureError(null);
    startStructure(async () => {
      const result = await structureAction(kind, fieldKey);
      if (result.error) setStructureError(result.error);
      else router.refresh();
    });
  };

  const addList = (fieldKey: string) => {
    if (!listAction) return;
    setStructureError(null);
    startStructure(async () => {
      const result = await listAction(fieldKey);
      if (result.error) setStructureError(result.error);
      else router.refresh();
    });
  };

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
            <div className="mt-3">
              <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-[#946332]">🔖 My Place</p>
              <label className={`mt-1 flex w-fit cursor-pointer items-center gap-3 rounded-xl border px-4 py-2 text-sm font-extrabold ${proofed.has(field.key) ? "border-[#326048]/30 bg-[#e7efe9] text-[#326048]" : "border-[#284a3b]/15 bg-white text-[#385245]"}`}>
                <input type="checkbox" checked={proofed.has(field.key)} onChange={(event) => setProofed(field.key, event.target.checked)} className="size-5 accent-[#326048]" />
                Pick up here next time
              </label>
            </div>
            {structureAction && STRUCTURE_FIELD.test(field.key) ? (
              <div className="mt-3 flex flex-wrap items-center gap-4 text-sm font-extrabold">
                <button type="button" disabled={changedCount > 0 || structurePending || pending} onClick={() => changeStructure("insert", field.key)} className="text-[#946332] hover:text-[#a85e32] disabled:cursor-not-allowed disabled:opacity-40">Add below</button>
                {listAction ? <button type="button" disabled={changedCount > 0 || structurePending || pending} onClick={() => addList(field.key)} className="text-[#946332] hover:text-[#a85e32] disabled:cursor-not-allowed disabled:opacity-40">Add bullet list below</button> : null}
                <button type="button" disabled={changedCount > 0 || structurePending || pending} onClick={() => changeStructure("delete", field.key)} className="text-[#a2472c] hover:underline disabled:cursor-not-allowed disabled:opacity-40">Delete</button>
              </div>
            ) : null}
          </div>
        );
      })}

      <div className="sticky bottom-0 -mx-1 rounded-2xl border border-[#a85e32]/20 bg-[#fff8f1] p-4 shadow-xl shadow-[#4d5f52]/10">
        <p className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-bold text-[#385245]">
          {placeIndex >= 0 ? (
            <>
              <span>🔖 Your place is on {unit} {placeIndex + 1} of {fields.length}</span>
              <button type="button" onClick={jumpToMyPlace} className="font-extrabold text-[#946332] underline hover:text-[#a85e32]">Jump to my place</button>
            </>
          ) : (
            <span>🔖 No place marked yet</span>
          )}
          <span className="font-normal text-[#607066]">(a private reminder, saved in this browser only)</span>
        </p>
        {state.error ? <p role="alert" className="mb-3 text-sm font-bold text-[#a2472c]">{state.error}</p> : null}
        {structureError ? <p role="alert" className="mb-3 text-sm font-bold text-[#a2472c]">{structureError}</p> : null}
        {structureAction && changedCount > 0 ? <p className="mb-3 text-sm text-[#607066]">Save your edits before adding or deleting a paragraph.</p> : null}
        {state.savedCount !== undefined && changedCount === 0 ? <p role="status" className="mb-3 text-sm font-bold text-[#326048]">Saved ({state.savedCount} {state.savedCount === 1 ? unit : `${unit}s`} changed). Nothing was published or emailed.</p> : null}
        <p className="mb-3 text-sm leading-6 text-[#607066]">Changes are saved to the draft only. Nothing is published or emailed until you publish.</p>
        <button type="submit" disabled={pending || changedCount === 0} className="admin-primary-button">
          <span>{pending ? "Saving..." : `Save ${changedCount} ${changedCount === 1 ? "change" : "changes"}`}</span>
        </button>
      </div>
    </form>
  );
}
