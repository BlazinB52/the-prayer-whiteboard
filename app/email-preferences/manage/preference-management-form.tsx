"use client";

import { useActionState, useState } from "react";
import { EMAIL_CATEGORIES, EMAIL_CATEGORY_LABELS, type EmailCategory, type PreferenceView } from "@/lib/email-categories";
import { saveEmailPreferences, type PreferenceSaveState } from "../actions";

const initialState: PreferenceSaveState = {};

export function PreferenceManagementForm({ preference }: { preference: PreferenceView }) {
  const [state, action, pending] = useActionState(saveEmailPreferences, initialState);
  const [selected, setSelected] = useState<Record<EmailCategory, boolean>>({
    weekly_updates: preference.categories.includes("weekly_updates"),
    teachings: preference.categories.includes("teachings"),
    devotionals: preference.categories.includes("devotionals"),
  });
  const [unsubscribeAll, setUnsubscribeAll] = useState(false);

  if (state.saved) {
    return <p role="status" className="rounded-2xl border border-[#326048]/20 bg-[#e7efe9] p-5 font-bold leading-7 text-[#244a3a]">{state.unsubscribed ? "You have been unsubscribed from Prayer Whiteboard email updates." : "Your Prayer Whiteboard email preferences were saved."}</p>;
  }

  return (
    <form action={action} className="rounded-2xl border border-[#284a3b]/10 bg-[#fffdf8] p-5 shadow-xl shadow-[#4d5f52]/8 sm:p-7">
      <input type="hidden" name="token" value={preference.token} />
      <p className="text-sm font-bold text-[#607066]">Managing {preference.emailMasked}</p>
      <label className="mt-5 block text-sm font-bold text-[#385245]">First name<input name="firstName" defaultValue={preference.firstName} required maxLength={120} className="admin-input" /></label>
      <fieldset className="mt-6" disabled={unsubscribeAll}>
        <legend className="text-sm font-extrabold text-[#385245]">Email categories</legend>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {EMAIL_CATEGORIES.map((category) => (
            <label key={category} className="flex min-h-14 items-center gap-3 rounded-xl border border-[#284a3b]/10 bg-white px-4 text-sm font-bold text-[#385245]">
              <input
                name={category}
                type="checkbox"
                checked={selected[category]}
                onChange={(event) => setSelected((current) => ({ ...current, [category]: event.target.checked }))}
              />
              {EMAIL_CATEGORY_LABELS[category]}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="mt-6 flex gap-3 text-sm font-bold leading-6 text-[#385245]">
        <input name="unsubscribeAll" type="checkbox" checked={unsubscribeAll} onChange={(event) => setUnsubscribeAll(event.target.checked)} />
        Unsubscribe from all Prayer Whiteboard email updates
      </label>
      {state.error ? <p role="alert" className="mt-4 text-sm font-bold text-[#a2472c]">{state.error}</p> : null}
      <button type="submit" disabled={pending} className="mt-6 inline-flex min-h-12 items-center justify-center rounded-2xl bg-[#244a3a] px-5 font-extrabold text-white shadow-xl shadow-[#244a3a]/20 disabled:cursor-not-allowed disabled:opacity-60">
        {pending ? "Saving..." : "Save preferences"}
      </button>
    </form>
  );
}
