"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { ArrowRight } from "lucide-react";
import { ESPANOL_EMAIL_CATEGORIES, emailCategoryLabel, type EmailCategory } from "@/lib/email-categories";
import { submitSubscriptionEs, type SubscribeStateEs } from "./actions";

const initialState: SubscribeStateEs = {};

export function SubscribeFormEs() {
  const [state, action, pending] = useActionState(submitSubscriptionEs, initialState);
  const [selected, setSelected] = useState<Record<string, boolean>>({ weekly_updates: false, teachings: false, devotionals: false });
  const allSelected = useMemo(() => ESPANOL_EMAIL_CATEGORIES.every((category) => selected[category]), [selected]);

  const result = state.submitted ? (
    <div role="status" className="rounded-2xl border border-[#326048]/20 bg-[#e7efe9] p-5 text-[#244a3a]">
      <h2 className="text-2xl font-extrabold">{state.alreadyConfirmed ? "¡Todo listo!" : "Un paso más."}</h2>
      <p className="mt-3 leading-7">
        {state.alreadyConfirmed
          ? "Tus preferencias de correo se actualizaron."
          : "Revisá tu correo y confirmá tu suscripción. Una vez confirmada, recibirás las actualizaciones por correo que elegiste."}
      </p>
    </div>
  ) : (
    <form action={action} className="rounded-2xl border border-[#284a3b]/10 bg-[#fffdf8] p-5 shadow-xl shadow-[#4d5f52]/8 sm:p-7">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-bold text-[#385245]">
          Nombre
          <input name="firstName" autoComplete="given-name" required maxLength={120} className="admin-input" />
        </label>
        <label className="block text-sm font-bold text-[#385245]">
          Correo electrónico
          <input name="email" type="email" autoComplete="email" required maxLength={320} className="admin-input" />
        </label>
      </div>
      <label className="hidden">
        Sitio web
        <input name="website" tabIndex={-1} autoComplete="off" />
      </label>
      <fieldset className="mt-6">
        <legend className="text-sm font-extrabold text-[#385245]">Elegí tus actualizaciones por correo</legend>
        <button
          type="button"
          onClick={() => setSelected({ weekly_updates: !allSelected, teachings: !allSelected, devotionals: !allSelected })}
          className="mt-3 inline-flex min-h-10 items-center rounded-xl border border-[#284a3b]/15 bg-white px-4 text-sm font-extrabold text-[#244a3a] transition hover:border-[#a85e32]/40 hover:text-[#a85e32]"
        >
          Seleccionar todo
        </button>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {ESPANOL_EMAIL_CATEGORIES.map((category: EmailCategory) => (
            <label key={category} className="flex min-h-14 items-center gap-3 rounded-xl border border-[#284a3b]/10 bg-white px-4 text-sm font-bold text-[#385245]">
              <input
                name={category}
                type="checkbox"
                checked={Boolean(selected[category])}
                onChange={(event) => setSelected((current) => ({ ...current, [category]: event.target.checked }))}
              />
              <span>
                {emailCategoryLabel(category, "es")}
                {category === "devotionals" ? <span className="mt-1 block text-xs font-normal leading-5 text-[#607066]">El devocional de 7 días actual y los próximos.</span> : null}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="mt-6">
        <legend className="text-sm font-extrabold text-[#385245]">Idioma de los correos</legend>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="flex min-h-14 items-center gap-3 rounded-xl border border-[#284a3b]/10 bg-white px-4 text-sm font-bold text-[#385245]">
            <input name="languageScope" type="radio" value="own" defaultChecked />
            <span>Solo en español</span>
          </label>
          <label className="flex min-h-14 items-center gap-3 rounded-xl border border-[#284a3b]/10 bg-white px-4 text-sm font-bold text-[#385245]">
            <input name="languageScope" type="radio" value="both" />
            <span>Español e inglés</span>
          </label>
        </div>
      </fieldset>
      <label className="mt-6 flex gap-3 text-sm font-bold leading-6 text-[#385245]">
        <input name="privacyConsent" type="checkbox" required className="mt-1" />
        <span>
          Acepto recibir los correos seleccionados de The Prayer Whiteboard y entiendo que puedo cambiar mis preferencias o cancelar mi suscripción más adelante. Consultá la{" "}
          <Link href="/espanol/privacidad" className="text-[#9d5a2f] underline underline-offset-2">Política de privacidad</Link>.
        </span>
      </label>
      {state.error ? <p role="alert" className="mt-4 text-sm font-bold text-[#a2472c]">{state.error}</p> : null}
      <button type="submit" disabled={pending} className="mt-6 inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#244a3a] px-6 text-base font-extrabold !text-white shadow-xl shadow-[#244a3a]/20 transition hover:-translate-y-0.5 hover:bg-[#1d3d30] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto">
        {pending ? "Enviando..." : "Suscribirse"} <ArrowRight aria-hidden="true" size={18} />
      </button>
      <p className="mt-4 text-sm leading-6 text-[#607066]">
        Después de suscribirte, te enviaremos un correo de confirmación. No recibirás estas actualizaciones a menos que confirmés tu suscripción.
      </p>
    </form>
  );

  return (
    <>
      <h1 className="mt-3 text-4xl font-extrabold tracking-tight text-[#243d31] sm:text-6xl">
        {state.submitted ? "Tus preferencias de correo" : "Elegí tus actualizaciones por correo"}
      </h1>
      <p className="mt-5 max-w-2xl text-base leading-7 text-[#52645a]">
        Suscribite a los correos de The Prayer Whiteboard que querás recibir. Elegí las actualizaciones semanales, las nuevas enseñanzas, los devocionales de 7 días, o todos.
      </p>
      <div className="mt-8">{result}</div>
    </>
  );
}
