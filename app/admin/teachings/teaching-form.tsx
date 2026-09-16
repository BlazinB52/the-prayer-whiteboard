"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";

type TeachingValues = {
  title: string;
  gatheringDate: string;
  centralTheme: string;
  introduction: string;
  summary: string;
  teaser1Heading: string;
  teaser1Text: string;
  teaser2Heading: string;
  teaser2Text: string;
  chalkboardAssetIds: string[];
  includeFooter: boolean;
  footerId: string;
};

type FormState = { error?: string; saved?: boolean };
type Action = (state: FormState, formData: FormData) => Promise<FormState>;
type ChalkboardOption = {
  id: string;
  label: string;
};
type FooterOption = { id: string; label: string };

export function TeachingForm({ values, action, chalkboards = [], footers = [] }: { values: TeachingValues; action: Action; chalkboards?: ChalkboardOption[]; footers?: FooterOption[] }) {
  const router = useRouter();
  const [draftValues, setDraftValues] = useState<TeachingValues>(values);
  const formKey = [values.title, values.gatheringDate, values.centralTheme, values.introduction, values.summary, values.teaser1Heading, values.teaser1Text, values.teaser2Heading, values.teaser2Text, values.chalkboardAssetIds.join(","), String(values.includeFooter), values.footerId].join("::");

  const handleChange = (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = event.target;
    setDraftValues((current) => ({ ...current, [name]: value }));
  };
  const handleChalkboardChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { value, checked } = event.target;
    setDraftValues((current) => ({
      ...current,
      chalkboardAssetIds: checked ? [...current.chalkboardAssetIds, value] : current.chalkboardAssetIds.filter((id) => id !== value),
    }));
  };
  const handleFooterToggle = (event: React.ChangeEvent<HTMLInputElement>) => {
    const checked = event.target.checked;
    setDraftValues((current) => ({ ...current, includeFooter: checked, footerId: checked ? current.footerId : "" }));
  };

  const [state, formAction, isPending] = useActionState(async (previousState: FormState, formData: FormData) => {
    const result = await action(previousState, formData);
    if (result.saved) {
      router.refresh();
    }
    return result;
  }, {});

  return (
    <form key={formKey} action={formAction} className="mt-8 space-y-6">
      <label className="block text-sm font-bold text-[#385245]">
        Title <span className="text-[#a2472c]">*</span>
        <input name="title" value={draftValues.title} onChange={handleChange} required maxLength={160} className="admin-input" />
      </label>
      <label className="block text-sm font-bold text-[#385245]">
        Gathering date
        <input name="gatheringDate" type="date" value={draftValues.gatheringDate} onChange={handleChange} className="admin-input" />
      </label>
      <label className="block text-sm font-bold text-[#385245]">
        Central theme
        <input name="centralTheme" value={draftValues.centralTheme} onChange={handleChange} maxLength={300} className="admin-input" />
      </label>
      <label className="block text-sm font-bold text-[#385245]">
        Introduction
        <textarea name="introduction" value={draftValues.introduction} onChange={handleChange} maxLength={5000} rows={6} className="admin-input resize-y py-3" />
      </label>
      <label className="block text-sm font-bold text-[#385245]">
        Short summary
        <textarea name="summary" value={draftValues.summary} onChange={handleChange} maxLength={500} rows={4} className="admin-input resize-y py-3" />
      </label>
      <fieldset className="space-y-4 rounded-xl border border-[#284a3b]/10 bg-white/70 p-4">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#946332]">Homepage teasers</p>
          <p className="mt-1 text-xs text-[#607066]">Teaser 1 is required before publication. Teaser 2 is optional, but both fields must be completed if either is used.</p>
        </div>
        <TeaserInput label="Teaser 1 heading" name="teaser1Heading" value={draftValues.teaser1Heading} onChange={handleChange} maxLength={100} requiredNote />
        <TeaserTextarea label="Teaser 1 text" name="teaser1Text" value={draftValues.teaser1Text} onChange={handleChange} maxLength={300} requiredNote />
        <TeaserInput label="Teaser 2 heading" name="teaser2Heading" value={draftValues.teaser2Heading} onChange={handleChange} maxLength={100} />
        <TeaserTextarea label="Teaser 2 text" name="teaser2Text" value={draftValues.teaser2Text} onChange={handleChange} maxLength={300} />
      </fieldset>
      <label className="block text-sm font-bold text-[#385245]">
        Chalkboards
        <span className="mt-2 grid gap-2 rounded-xl border border-[#284a3b]/10 bg-white/70 p-3">
          {chalkboards.length ? chalkboards.map((chalkboard) => (
            <span key={chalkboard.id} className="flex items-center gap-3 font-normal text-[#385245]">
              <input type="checkbox" name="chalkboardAssetIds" value={chalkboard.id} checked={draftValues.chalkboardAssetIds.includes(chalkboard.id)} onChange={handleChalkboardChange} />
              <span>{chalkboard.label}</span>
            </span>
          )) : <span className="text-sm font-normal text-[#607066]">No current chalkboards are available.</span>}
        </span>
        <span className="mt-1 block text-xs font-normal text-[#607066]">A teaching can reference multiple library chalkboards. Removing a selection does not delete the chalkboard.</span>
      </label>
      <fieldset className="space-y-3 rounded-xl border border-[#284a3b]/10 bg-white/70 p-4">
        <label className="flex items-center gap-3 text-sm font-bold text-[#385245]">
          <input type="checkbox" name="includeFooter" checked={draftValues.includeFooter} onChange={handleFooterToggle} />
          Include footer
        </label>
        <label className="block text-sm font-bold text-[#385245]">
          Footer
          <select name="footerId" value={draftValues.footerId} onChange={handleChange} disabled={!draftValues.includeFooter} required={draftValues.includeFooter} className="admin-input">
            <option value="">Choose a footer</option>
            {footers.map((footer) => <option key={footer.id} value={footer.id}>{footer.label}</option>)}
          </select>
        </label>
      </fieldset>
      {state.error ? <p role="alert" className="text-sm font-bold text-[#a2472c]">{state.error}</p> : null}
      {state.saved ? <p role="status" className="text-sm font-bold text-[#326048]">Teaching saved.</p> : null}
      <div className="flex flex-col gap-3 sm:flex-row">
        <button type="submit" disabled={isPending} className="min-h-12 rounded-xl bg-[#244a3a] px-6 font-extrabold text-white transition hover:bg-[#1d3d30] hover:text-white disabled:cursor-not-allowed disabled:opacity-60">
          <span className="!text-white">{isPending ? "Saving..." : "Save Teaching"}</span>
        </button>
        <button type="submit" name="saveAction" value="return" disabled={isPending} className="min-h-12 rounded-xl bg-[#244a3a] px-6 font-extrabold text-white transition hover:bg-[#1d3d30] hover:text-white disabled:cursor-not-allowed disabled:opacity-60">
          <span className="!text-white">Save &amp; Return to Teachings</span>
        </button>
      </div>
    </form>
  );
}

function FieldCounter({ value, maxLength }: { value: string; maxLength: number }) {
  return <span className="mt-1 block text-xs font-normal text-[#607066]">{value.length}/{maxLength}</span>;
}

function TeaserInput({ label, name, value, onChange, maxLength, requiredNote = false }: { label: string; name: keyof TeachingValues; value: string; onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void; maxLength: number; requiredNote?: boolean }) {
  return (
    <label className="block text-sm font-bold text-[#385245]">
      {label} <span className="text-xs font-normal text-[#607066]">{requiredNote ? "Required before publication" : "Optional"}</span>
      <input name={name} value={value} onChange={onChange} maxLength={maxLength} className="admin-input" />
      <FieldCounter value={value} maxLength={maxLength} />
    </label>
  );
}

function TeaserTextarea({ label, name, value, onChange, maxLength, requiredNote = false }: { label: string; name: keyof TeachingValues; value: string; onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void; maxLength: number; requiredNote?: boolean }) {
  return (
    <label className="block text-sm font-bold text-[#385245]">
      {label} <span className="text-xs font-normal text-[#607066]">{requiredNote ? "Required before publication" : "Optional"}</span>
      <textarea name={name} value={value} onChange={onChange} maxLength={maxLength} rows={3} className="admin-input resize-y py-3" />
      <FieldCounter value={value} maxLength={maxLength} />
    </label>
  );
}
