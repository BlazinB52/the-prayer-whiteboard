"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";

type FormState = { error?: string; saved?: boolean };
type Action = (state: FormState, formData: FormData) => Promise<FormState>;

export function WeeklyUpdateEditor({ action, initialTitle = "", submitLabel = "Save Weekly Update", sourceRequired = false }: { action: Action; initialTitle?: string; submitLabel?: string; sourceRequired?: boolean }) {
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle);
  const [state, formAction, pending] = useActionState(async (previousState: FormState, formData: FormData) => {
    const result = await action(previousState, formData);
    if (result.saved) router.refresh();
    return result;
  }, {});

  return (
    <form action={formAction} className="space-y-4">
      <label className="block text-sm font-bold text-[#385245]">Title<input name="title" value={title} onChange={(event) => setTitle(event.target.value)} required maxLength={180} className="admin-input" /></label>
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
