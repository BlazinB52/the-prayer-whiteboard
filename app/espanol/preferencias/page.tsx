import type { Metadata } from "next";
import Link from "next/link";
import { PublicFooterEs } from "@/app/public-footer-es";
import { PublicHeader } from "@/app/public-header";
import { PreferenceRequestFormEs } from "./preference-request-form-es";

export const metadata: Metadata = {
  title: "Preferencias de correo",
  robots: { index: false, follow: false },
};

export default function PreferenciasPage() {
  return (
    <main lang="es" className="min-h-screen bg-[#f7f2e8] text-[#243126]">
      <PublicHeader variant="es" maxWidthClassName="max-w-4xl" end={<Link href="/espanol" className="shrink-0 text-sm font-extrabold text-[#244a3a]">Inicio</Link>} />
      <section className="mx-auto max-w-4xl px-5 py-10 sm:px-8 sm:py-16">
        <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#946332]">Preferencias de correo</p>
        <h1 className="mt-3 text-4xl font-extrabold tracking-tight text-[#243d31] sm:text-6xl">Administra tus actualizaciones por correo</h1>
        <p className="mt-5 max-w-2xl text-base leading-7 text-[#52645a]">Escribe tu dirección de correo electrónico y te enviaremos un enlace seguro y temporal para administrar tus preferencias.</p>
        <div className="mt-8"><PreferenceRequestFormEs /></div>
      </section>
      <PublicFooterEs />
    </main>
  );
}
