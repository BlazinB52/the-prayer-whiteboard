"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";

type TeachingValues = {
  title: string;
  gatheringDate: string;
  centralTheme: string;
  introduction: string;
  summary: string;
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
  const formKey = [values.title, values.gatheringDate, values.centralTheme, values.introduction, values.summary, values.chalkboardAssetIds.join(","), String(values.includeFooter), values.footerId].join("::");

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
