"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";

type FormState = { error?: string; saved?: boolean };
type Action = (state: FormState, formData: FormData) => Promise<FormState>;
export type WeeklyUpdateChalkboardOption = {
  id: string;
  label: string;
};
export type WeeklyUpdateFooterOption = { id: string; label: string };

export function WeeklyUpdateEditor({ action, weeklyUpdateId, initialTitle = "", initialChalkboardAssetIds = [], initialFooterId = "", chalkboards = [], footers = [], submitLabel = "Save Weekly Update", sourceRequired = false }: { action: Action; weeklyUpdateId?: string; initialTitle?: string; initialChalkboardAssetIds?: string[]; initialFooterId?: string | null; chalkboards?: WeeklyUpdateChalkboardOption[]; footers?: WeeklyUpdateFooterOption[]; submitLabel?: string; sourceRequired?: boolean }) {
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle);
  const [chalkboardAssetIds, setChalkboardAssetIds] = useState(initialChalkboardAssetIds);
  const [includeFooter, setIncludeFooter] = useState(Boolean(initialFooterId));
  const [footerId, setFooterId] = useState(initialFooterId ?? "");
  const [state, formAction, pending] = useActionState(async (previousState: FormState, formData: FormData) => {
    const result = await action(previousState, formData);
    if (result.saved) router.refresh();
    return result;
  }, {});
  const handleChalkboardChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { value, checked } = event.target;
    setChalkboardAssetIds((current) => checked ? [...current, value] : current.filter((id) => id !== value));
  };
  const handleFooterToggle = (event: React.ChangeEvent<HTMLInputElement>) => {
    const checked = event.target.checked;
    setIncludeFooter(checked);
    if (!checked) setFooterId("");
  };

  return (
    <form action={formAction} className="space-y-4">
      {weeklyUpdateId ? <input type="hidden" name="weeklyUpdateId" value={weeklyUpdateId} /> : null}
      <label className="block text-sm font-bold text-[#385245]">Title<input name="title" value={title} onChange={(event) => setTitle(event.target.value)} required maxLength={180} className="admin-input" /></label>
      <label className="block text-sm font-bold text-[#385245]">
        Weekly Update chalkboards
        <span className="mt-2 grid gap-2 rounded-xl border border-[#284a3b]/10 bg-white/70 p-3">
          {chalkboards.length ? chalkboards.map((chalkboard) => (
            <span key={chalkboard.id} className="flex items-center gap-3 font-normal text-[#385245]">
              <input type="checkbox" name="chalkboardAssetIds" value={chalkboard.id} checked={chalkboardAssetIds.includes(chalkboard.id)} onChange={handleChalkboardChange} />
              <span>{chalkboard.label}</span>
            </span>
          )) : <span className="text-sm font-normal text-[#607066]">No current chalkboards are available.</span>}
        </span>
      </label>
      <fieldset className="space-y-3 rounded-xl border border-[#284a3b]/10 bg-white/70 p-4">
        <label className="flex items-center gap-3 text-sm font-bold text-[#385245]">
          <input type="checkbox" name="includeFooter" checked={includeFooter} onChange={handleFooterToggle} />
          Include footer
        </label>
        <label className="block text-sm font-bold text-[#385245]">
          Footer
          <select name="footerId" value={footerId} onChange={(event) => setFooterId(event.target.value)} disabled={!includeFooter} required={includeFooter} className="admin-input">
            <option value="">Choose a footer</option>
            {footers.map((footer) => <option key={footer.id} value={footer.id}>{footer.label}</option>)}
          </select>
        </label>
      </fieldset>
      <label className="block text-sm font-bold text-[#385245]">
        Weekly update document
        <input name="sourceDocument" type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" required={sourceRequired} className="admin-input py-2" />
        <span className="mt-1 block text-xs font-normal text-[#607066]">{sourceRequired ? "Upload the .docx source document. Conversion runs on the server." : "Upload a replacement .docx only when you want to reconvert the content."}</span>
      </label>
      {state.error ? <p role="alert" className="text-sm font-bold text-[#a2472c]">{state.error}</p> : null}
      {state.saved ? <p role="status" className="text-sm font-bold text-[#326048]">Weekly update saved.</p> : null}
      <button type="submit" disabled={pending} className="admin-primary-button"><span>{pending ? "Saving..." : submitLabel}</span></button>
    </form>
  );
}
