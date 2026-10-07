import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/alternates";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PublicFooterEs } from "@/app/public-footer-es";
import { PublicHeader } from "@/app/public-header";
import { loadPreferenceToken } from "@/lib/email-subscriptions";
import { PreferenceManagementFormEs } from "./preference-management-form-es";

export const metadata: Metadata = buildPageMetadata({ title: "Administrar preferencias de correo", path: "/espanol/preferencias/administrar", language: "es", noindex: true });

export default async function AdministrarPreferenciasPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  const preference = await loadPreferenceToken(token);
  // An English subscriber who lands here gets the English page for their own link.
  if (preference?.language === "en") redirect(`/email-preferences/manage?token=${encodeURIComponent(token)}`);

  return (
    <main lang="es" className="min-h-screen bg-[#f7f2e8] text-[#243126]">
      <PublicHeader variant="es" maxWidthClassName="max-w-4xl" end={<Link href="/espanol" className="shrink-0 text-sm font-extrabold text-[#244a3a]">Inicio</Link>} />
      <section className="mx-auto max-w-4xl px-5 py-10 sm:px-8 sm:py-16">
        <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#946332]">Preferencias de correo</p>
        <h1 className="mt-3 text-4xl font-extrabold tracking-tight text-[#243d31] sm:text-6xl">Tus actualizaciones por correo</h1>
        <div className="mt-8">
          {preference ? (
            <PreferenceManagementFormEs preference={preference} />
          ) : (
            <div className="rounded-2xl border border-[#284a3b]/10 bg-[#fffdf8] p-6 shadow-xl shadow-[#4d5f52]/8">
              <p className="font-bold leading-7 text-[#52645a]">Este enlace de preferencias no es válido o venció.</p>
              <Link href="/espanol/preferencias" className="mt-5 inline-flex min-h-12 items-center justify-center rounded-2xl bg-[#244a3a] px-5 font-extrabold text-white shadow-xl shadow-[#244a3a]/20">Solicitar un nuevo enlace</Link>
            </div>
          )}
        </div>
      </section>
      <PublicFooterEs />
    </main>
  );
}
