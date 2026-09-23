"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { FormattedTextarea } from "@/app/admin/formatted-textarea";

type FormState = { error?: string; saved?: boolean; deleted?: boolean };
type Action = (state: FormState, formData: FormData) => Promise<FormState>;

export function FooterForm({ action, internalTitle = "", content = "", submitLabel = "Save footer" }: { action: Action; internalTitle?: string; content?: string; submitLabel?: string }) {
  const router = useRouter();
  const [title, setTitle] = useState(internalTitle);
  const [body, setBody] = useState(content);
  const [state, formAction, pending] = useActionState(async (previousState: FormState, formData: FormData) => {
    const result = await action(previousState, formData);
    if (result.saved || result.deleted) router.refresh();
    return result;
  }, {});

  return (
    <form action={formAction} className="space-y-4">
      <label className="block text-sm font-bold text-[#385245]">Internal title<input name="internalTitle" value={title} onChange={(event) => setTitle(event.target.value)} required maxLength={160} className="admin-input" /></label>
      <FormattedTextarea label="Displayed content" name="content" value={body} onValueChange={setBody} required maxLength={5000} rows={6} />
      <p className="text-xs leading-5 text-[#607066]">Paragraph breaks are preserved. Use the formatting controls for emphasis, bullets, and HTTP or HTTPS links.</p>
      {state.error ? <p role="alert" className="text-sm font-bold text-[#a2472c]">{state.error}</p> : null}
      {state.saved ? <p role="status" className="text-sm font-bold text-[#326048]">Footer saved.</p> : null}
      <button type="submit" disabled={pending} className="admin-primary-button"><span>{pending ? "Saving..." : submitLabel}</span></button>
    </form>
  );
}

export function FooterDeleteForm({ action }: { action: Action }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(async (previousState: FormState, formData: FormData) => {
    const result = await action(previousState, formData);
    if (result.deleted) router.refresh();
    return result;
  }, {});

  return (
    <form action={formAction} className="mt-3 space-y-3">
      <label className="block text-sm font-bold text-[#5d2b1f]">Type DELETE to confirm<input name="confirmation" className="admin-input" /></label>
      {state.error ? <p role="alert" className="text-sm font-bold text-[#a2472c]">{state.error}</p> : null}
      {state.deleted ? <p role="status" className="text-sm font-bold text-[#326048]">Footer deleted.</p> : null}
      <button type="submit" disabled={pending} className="min-h-11 rounded-xl bg-[#a2472c] px-5 font-extrabold text-white transition hover:bg-[#8f3823] disabled:cursor-not-allowed disabled:opacity-60"><span className="!text-white">{pending ? "Deleting..." : "Delete footer"}</span></button>
    </form>
  );
}
