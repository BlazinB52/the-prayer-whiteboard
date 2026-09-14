"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";

type FormState = { error?: string; saved?: boolean };
type Action = (state: FormState, formData: FormData) => Promise<FormState>;
export type WeeklyUpdateChalkboardOption = {
  id: string;
  label: string;
};

export function WeeklyUpdateEditor({ action, weeklyUpdateId, initialTitle = "", initialChalkboardAssetId = "", chalkboards = [], submitLabel = "Save Weekly Update", sourceRequired = false }: { action: Action; weeklyUpdateId?: string; initialTitle?: string; initialChalkboardAssetId?: string | null; chalkboards?: WeeklyUpdateChalkboardOption[]; submitLabel?: string; sourceRequired?: boolean }) {
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle);
  const [chalkboardAssetId, setChalkboardAssetId] = useState(initialChalkboardAssetId ?? "");
  const [state, formAction, pending] = useActionState(async (previousState: FormState, formData: FormData) => {
    const result = await action(previousState, formData);
    if (result.saved) router.refresh();
    return result;
  }, {});

  return (
    <form action={formAction} className="space-y-4">
      {weeklyUpdateId ? <input type="hidden" name="weeklyUpdateId" value={weeklyUpdateId} /> : null}
      <label className="block text-sm font-bold text-[#385245]">Title<input name="title" value={title} onChange={(event) => setTitle(event.target.value)} required maxLength={180} className="admin-input" /></label>
      <label className="block text-sm font-bold text-[#385245]">
        Weekly Update chalkboard
        <select name="chalkboardAssetId" value={chalkboardAssetId} onChange={(event) => setChalkboardAssetId(event.target.value)} className="admin-input">
          <option value="">No Weekly Update chalkboard</option>
          {chalkboards.map((chalkboard) => <option key={chalkboard.id} value={chalkboard.id}>{chalkboard.label}</option>)}
        </select>
      </label>
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
