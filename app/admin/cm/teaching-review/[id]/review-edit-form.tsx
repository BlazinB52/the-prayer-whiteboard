"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { FormattedTextarea } from "@/app/admin/formatted-textarea";
import { useProofed } from "@/app/admin/use-my-place";
import { TrackedText } from "@/lib/tracked-text";
import type { TeachingReviewState } from "../actions";

export type ReviewFormField = {
  id: string;
  label: string;
  context: string;
  /** The approved wording the editor is working from; sent back so the database can detect newer edits. */
  base: string;
  /** What the editor sees first: their saved proposal, or the approved wording. */
  value: string;
  maxLength: number;
  multiline: boolean;
  rows: number;
  formatted: boolean;
  /** Set when the approved wording changed after the editor saved a proposal for this field. */
  changedSince: string | null;
};

type Action = (state: TeachingReviewState, formData: FormData) => Promise<TeachingReviewState>;

// submitsAsOk: submitting is the editor's one and only pass and also tells the Administrator the item is OK to
// publish, so it is allowed with no changes and the wording says so plainly.
export function ReviewEditForm({ action, fields, canEdit, subject = "teaching", submitsAsOk = false }: { action: Action; fields: ReviewFormField[]; canEdit: boolean; subject?: "teaching" | "devotional" | "weekly update" | "teaching outline" | "handout"; submitsAsOk?: boolean }) {
  const [state, formAction, pending] = useActionState(action, {});
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(fields.map((field) => [field.id, field.value])));
  const setValue = (id: string, value: string) => setValues((current) => ({ ...current, [id]: value }));

  // The wording as it stood when Save Draft was last pressed, so the editor can read exactly what they
  // are about to send. A draft saved in an earlier visit is shown the same way when the page opens.
  const pathname = usePathname();
  const { proofed, toggle: setProofed } = useProofed(`review-proofed:${pathname}`);

  const [initialValues] = useState<Record<string, string>>(() => Object.fromEntries(fields.map((field) => [field.id, field.value])));
  const [lastSubmitted, setLastSubmitted] = useState<Record<string, string> | null>(null);
  const summaryRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (state.saved) summaryRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [state]);

  // Group the fields under their heading so a long teaching stays easy to scan.
  const groups: { context: string; items: ReviewFormField[] }[] = [];
  for (const field of fields) {
    const last = groups.at(-1);
    if (last && last.context === field.context) last.items.push(field);
    else groups.push({ context: field.context, items: [field] });
  }

  // Cards are named by their heading, with a counter when two cards share one, so a tick stays with its card.
  const seen: Record<string, number> = {};
  const cardKeys = groups.map((group) => {
    seen[group.context] = (seen[group.context] ?? 0) + 1;
    return `${group.context}#${seen[group.context]}`;
  });
  // "My Place": the last card marked, in reading order, is where to pick up next time.
  const placeIndex = cardKeys.reduce((last, key, index) => (proofed.has(key) ? index : last), -1);
  const jumpToMyPlace = () => {
    if (placeIndex >= 0) document.getElementById(`proof-card-${placeIndex}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const changedCount = fields.filter((field) => values[field.id].trim() !== field.base.trim()).length;

  const savedValues = state.saved && lastSubmitted ? lastSubmitted : initialValues;
  const savedChanges = fields.filter((field) => (savedValues[field.id] ?? field.base).trim() !== field.base.trim());

  return (
    <form
      action={formAction}
      onSubmit={() => setLastSubmitted(values)}
      className="mt-8 space-y-8"
    >
      {groups.map((group, groupIndex) => (
        <section key={cardKeys[groupIndex]} id={`proof-card-${groupIndex}`} className="scroll-mt-4 rounded-2xl border border-[#284a3b]/10 bg-[#fffdf8] p-5 shadow-lg shadow-[#4d5f52]/8 sm:p-6">
          <h2 className="text-lg font-extrabold text-[#243d31]">{group.context}</h2>
          <div className="mt-4 space-y-5">
            {group.items.map((field) => (
              <div key={field.id}>
                <input type="hidden" name={`base:${field.id}`} value={field.base} />
                {field.formatted ? (
                  <FormattedTextarea
                    label={field.label}
                    name={`value:${field.id}`}
                    value={values[field.id]}
                    onValueChange={(next) => setValue(field.id, next)}
                    rows={field.rows}
                    maxLength={field.maxLength}
                    bullets={false}
                  />
                ) : field.multiline ? (
                  <label className="block text-sm font-bold text-[#385245]">
                    {field.label}
                    <textarea name={`value:${field.id}`} value={values[field.id]} onChange={(event) => setValue(field.id, event.target.value)} rows={field.rows} maxLength={field.maxLength} disabled={!canEdit} className="admin-input resize-y py-3" />
                  </label>
                ) : (
                  <label className="block text-sm font-bold text-[#385245]">
                    {field.label}
                    <input name={`value:${field.id}`} value={values[field.id]} onChange={(event) => setValue(field.id, event.target.value)} maxLength={field.maxLength} disabled={!canEdit} className="admin-input" />
                  </label>
                )}
                {values[field.id].trim() !== field.base.trim() ? <p className="mt-1 text-xs font-extrabold text-[#1a4fb4]">Proposed change</p> : null}
                {field.changedSince !== null ? (
                  <div role="alert" className="mt-2 rounded-xl border border-[#c49a3a]/40 bg-[#fbf4e1] p-3 text-sm leading-6 text-[#6b5013]">
                    <p className="font-extrabold">The approved wording changed after you wrote this proposal.</p>
                    <p className="mt-1">Your earlier proposal is shown below for reference. The box above now holds the current wording.</p>
                    <p className="mt-2 whitespace-pre-wrap rounded-lg bg-white/70 p-2">{field.changedSince}</p>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
          <div className="mt-5">
            <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-[#946332]">🔖 My Place</p>
            <label className={`mt-1 flex w-fit cursor-pointer items-center gap-3 rounded-xl border px-4 py-2 text-sm font-extrabold ${proofed.has(cardKeys[groupIndex]) ? "border-[#326048]/30 bg-[#e7efe9] text-[#326048]" : "border-[#284a3b]/15 bg-white text-[#385245]"}`}>
              <input
                type="checkbox"
                checked={proofed.has(cardKeys[groupIndex])}
                onChange={(event) => setProofed(cardKeys[groupIndex], event.target.checked)}
                className="size-5 accent-[#326048]"
              />
              Pick up here next time
            </label>
          </div>
        </section>
      ))}

      {savedChanges.length ? (
        <section ref={summaryRef} aria-labelledby="saved-changes-heading" className="scroll-mt-4 rounded-2xl border border-[#1a4fb4]/20 bg-[#fffdf8] p-5 shadow-lg shadow-[#4d5f52]/8 sm:p-6">
          <h2 id="saved-changes-heading" className="text-lg font-extrabold text-[#243d31]">
            Your saved changes ({savedChanges.length})
          </h2>
          <p className="mt-1 text-sm leading-6 text-[#607066]">
            This is what the Administrator will see. <span className="rounded bg-[#fdecea] px-1 text-[#b3261e] line-through">Red struck-through</span> wording is removed and{" "}
            <span className="rounded bg-[#e8f0fe] px-1 text-[#1a4fb4] underline">blue underlined</span> wording is added. Check it, then press Submit for Admin Review.
          </p>
          <div className="mt-4 space-y-4">
            {savedChanges.map((field) => (
              <article key={field.id} className="rounded-xl border border-[#284a3b]/10 bg-white p-4">
                <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-[#946332]">{field.context}</p>
                <h3 className="mt-1 text-base font-extrabold text-[#243d31]">{field.label}</h3>
                <div className="mt-2"><TrackedText original={field.base} proposed={savedValues[field.id]} /></div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <div className="sticky bottom-0 -mx-1 rounded-2xl border border-[#a85e32]/20 bg-[#fff8f1] p-4 shadow-xl shadow-[#4d5f52]/10">
        <p className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-bold text-[#385245]">
          {placeIndex >= 0 ? (
            <>
              <span>🔖 Your place is on card {placeIndex + 1} of {groups.length}</span>
              <button type="button" onClick={jumpToMyPlace} className="font-extrabold text-[#946332] underline hover:text-[#a85e32]">Jump to my place</button>
            </>
          ) : (
            <span>🔖 No place marked yet</span>
          )}
          <span className="font-normal text-[#607066]">(a private reminder, saved in this browser only)</span>
        </p>
        <p className="text-sm leading-6 text-[#607066]">Changes made here are proposals only. The approved {subject} will not change until an Administrator accepts them.</p>
        {submitsAsOk ? (
          <p role="note" className="mt-3 rounded-xl border-2 border-[#a2472c]/40 bg-[#fff3ed] px-4 py-3 text-sm font-extrabold leading-6 text-[#7a2a12]">
            Submitting to the Administrator means you are saying this {subject} is OK to publish. You get one pass: after you submit you cannot make any more changes. If you found nothing to change, you can still submit it as is.
          </p>
        ) : null}
        {state.error ? <p role="alert" className="mt-3 text-sm font-bold text-[#a2472c]">{state.error}</p> : null}
        {state.saved ? <p role="status" className="mt-3 text-sm font-bold text-[#326048]">Draft saved ({state.savedCount ?? 0} {state.savedCount === 1 ? "change" : "changes"}).</p> : null}
        {canEdit ? (
          <div className="mt-3 flex flex-col gap-3 sm:flex-row">
            <button type="submit" name="intent" value="save" disabled={pending} className="admin-secondary-button">{pending ? "Saving..." : `Save Draft (${changedCount} ${changedCount === 1 ? "change" : "changes"})`}</button>
            <button
              type="submit"
              name="intent"
              value="submit"
              disabled={pending || (!submitsAsOk && changedCount === 0)}
              onClick={(event) => {
                const message = submitsAsOk
                  ? `Submit to the Administrator as OK to publish${changedCount ? ` with ${changedCount} proposed ${changedCount === 1 ? "change" : "changes"}` : " with no changes"}? This says the ${subject} is OK to publish, and you will not be able to make any more changes.`
                  : "Submit these changes for Administrator review? You will not be able to edit them after submitting.";
                if (!window.confirm(message)) event.preventDefault();
              }}
              className="admin-primary-button"
            >
              <span>{submitsAsOk ? "Submit to Administrator: OK to publish" : "Submit for Admin Review"}</span>
            </button>
            <button
              type="submit"
              name="intent"
              value="discard"
              formNoValidate
              disabled={pending}
              onClick={(event) => {
                if (!window.confirm("Discard your draft? Your proposed changes will be deleted.")) event.preventDefault();
              }}
              className="min-h-12 rounded-xl border border-[#a2472c]/30 bg-white px-5 font-extrabold text-[#a2472c] transition hover:bg-[#fff3ed]"
            >
              Discard Draft
            </button>
          </div>
        ) : null}
      </div>
    </form>
  );
}
