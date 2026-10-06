"use client";

import { useActionState, useState } from "react";
import { ESPANOL_EMAIL_CATEGORIES, emailCategoryLabel, type PreferenceView } from "@/lib/email-categories";
import { saveEmailPreferencesEs, type PreferenceSaveStateEs } from "../../suscribirse/actions";

const initialState: PreferenceSaveStateEs = {};

export function PreferenceManagementFormEs({ preference }: { preference: PreferenceView }) {
  const [state, action, pending] = useActionState(saveEmailPreferencesEs, initialState);
  const [selected, setSelected] = useState<Record<string, boolean>>({
    teachings: preference.categories.includes("teachings"),
    devotionals: preference.categories.includes("devotionals"),
  });
  const [unsubscribeAll, setUnsubscribeAll] = useState(false);

  if (state.saved) {
    return <p role="status" className="rounded-2xl border border-[#326048]/20 bg-[#e7efe9] p-5 font-bold leading-7 text-[#244a3a]">{state.unsubscribed ? "Se canceló tu suscripción a las actualizaciones por correo de Prayer Whiteboard." : "Se guardaron tus preferencias de correo de Prayer Whiteboard."}</p>;
  }

  return (
    <form action={action} className="rounded-2xl border border-[#284a3b]/10 bg-[#fffdf8] p-5 shadow-xl shadow-[#4d5f52]/8 sm:p-7">
      <input type="hidden" name="token" value={preference.token} />
      <p className="text-sm font-bold text-[#607066]">Administrando {preference.emailMasked}</p>
      <label className="mt-5 block text-sm font-bold text-[#385245]">Nombre<input name="firstName" defaultValue={preference.firstName} required maxLength={120} className="admin-input" /></label>
      <fieldset className="mt-6" disabled={unsubscribeAll}>
        <legend className="text-sm font-extrabold text-[#385245]">Categorías de correo</legend>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {ESPANOL_EMAIL_CATEGORIES.map((category) => (
            <label key={category} className="flex min-h-14 items-center gap-3 rounded-xl border border-[#284a3b]/10 bg-white px-4 text-sm font-bold text-[#385245]">
              <input
                name={category}
                type="checkbox"
                checked={Boolean(selected[category])}
                onChange={(event) => setSelected((current) => ({ ...current, [category]: event.target.checked }))}
              />
              {emailCategoryLabel(category, "es")}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="mt-6 flex gap-3 text-sm font-bold leading-6 text-[#385245]">
        <input name="unsubscribeAll" type="checkbox" checked={unsubscribeAll} onChange={(event) => setUnsubscribeAll(event.target.checked)} />
        Cancelar mi suscripción a todas las actualizaciones por correo de Prayer Whiteboard
      </label>
      {state.error ? <p role="alert" className="mt-4 text-sm font-bold text-[#a2472c]">{state.error}</p> : null}
      <button type="submit" disabled={pending} className="mt-6 inline-flex min-h-12 items-center justify-center rounded-2xl bg-[#244a3a] px-5 font-extrabold text-white shadow-xl shadow-[#244a3a]/20 disabled:cursor-not-allowed disabled:opacity-60">
        {pending ? "Guardando..." : "Guardar preferencias"}
      </button>
    </form>
  );
}
