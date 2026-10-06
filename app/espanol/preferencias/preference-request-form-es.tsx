"use client";

import { useActionState } from "react";
import { requestPreferenceAccessEs, type PreferenceRequestStateEs } from "../suscribirse/actions";

const initialState: PreferenceRequestStateEs = {};

export function PreferenceRequestFormEs() {
  const [state, action, pending] = useActionState(requestPreferenceAccessEs, initialState);
  if (state.submitted) {
    return <p role="status" className="rounded-2xl border border-[#326048]/20 bg-[#e7efe9] p-5 font-bold leading-7 text-[#244a3a]">Si ese correo está conectado a las actualizaciones de Prayer Whiteboard, te enviaremos en breve un enlace seguro de preferencias. Revisá las carpetas de correo no deseado, spam o promociones si no lo ves.</p>;
  }
  return (
    <form action={action} className="rounded-2xl border border-[#284a3b]/10 bg-[#fffdf8] p-5 shadow-xl shadow-[#4d5f52]/8 sm:p-7">
      <label className="block text-sm font-bold text-[#385245]">Correo electrónico<input name="email" type="email" autoComplete="email" required maxLength={320} className="admin-input" /></label>
      <label className="hidden">Sitio web<input name="website" tabIndex={-1} autoComplete="off" /></label>
      {state.error ? <p role="alert" className="mt-4 text-sm font-bold text-[#a2472c]">{state.error}</p> : null}
      <button type="submit" disabled={pending} className="mt-6 inline-flex min-h-12 items-center justify-center rounded-2xl bg-[#244a3a] px-5 font-extrabold text-white shadow-xl shadow-[#244a3a]/20 disabled:cursor-not-allowed disabled:opacity-60">
        {pending ? "Enviando..." : "Enviar enlace de preferencias"}
      </button>
    </form>
  );
}
