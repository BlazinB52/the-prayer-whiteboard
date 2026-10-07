"use client";

import { useActionState } from "react";
import { saveTranslation, type TranslationKind, type TranslationState } from "./actions";
import type { TranslationOption } from "@/lib/translation-options";


// The admin control for pairing an English item with its Español translation (or the reverse).
export function TranslationPicker({
  kind,
  id,
  language,
  currentId,
  options,
  revalidate,
  noun,
}: {
  kind: TranslationKind;
  id: string;
  language: "en" | "es";
  currentId: string;
  options: TranslationOption[];
  revalidate: string;
  noun: string;
}) {
  const [state, formAction, pending] = useActionState<TranslationState, FormData>(saveTranslation.bind(null, kind, id, revalidate), {});
  const otherLanguage = language === "es" ? "English" : "Español";

  return (
    <section className="mt-8 rounded-2xl border border-[#284a3b]/10 bg-[#fffdf8] p-5">
      <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#946332]">Translation</p>
      <h2 className="mt-2 text-2xl font-extrabold text-[#243d31]">{otherLanguage} version of this {noun}</h2>
      <p className="mt-3 text-sm leading-6 text-[#607066]">
        Pair this {noun} with its {otherLanguage} counterpart. The two public pages then point to each other: search engines are told they are translations of one another, and each page shows a link to the other. Only {otherLanguage} items are listed. Choose &ldquo;None&rdquo; to remove the pairing.
      </p>
      <form action={formAction} className="mt-4 flex flex-wrap items-end gap-3">
        <label className="block min-w-64 flex-1 text-sm font-bold text-[#385245]">
          {otherLanguage} {noun}
          <select name="translation_of" defaultValue={currentId} className="admin-input mt-1">
            <option value="">None (no translation)</option>
            {options.map((option) => <option key={option.id} value={option.id} disabled={option.disabled}>{option.label}</option>)}
          </select>
        </label>
        <button type="submit" disabled={pending} className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-[#244a3a] px-5 text-sm font-extrabold !text-white disabled:opacity-60">
          {pending ? "Saving…" : "Save translation"}
        </button>
      </form>
      {state.error ? <p role="alert" className="mt-3 text-sm font-bold text-[#a2472c]">{state.error}</p> : null}
      {state.saved ? <p role="status" className="mt-3 text-sm font-bold text-[#326048]">Translation saved.</p> : null}
    </section>
  );
}
