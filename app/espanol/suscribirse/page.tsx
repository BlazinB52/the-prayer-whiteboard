import type { Metadata } from "next";
import { buildPageMetadata, STATIC_TRANSLATIONS } from "@/lib/alternates";
import Link from "next/link";
import { PublicFooterEs } from "@/app/public-footer-es";
import { PublicHeader } from "@/app/public-header";
import { ReturnToTop } from "@/app/return-to-top";
import { SubscribeFormEs } from "./subscribe-form-es";

export const metadata: Metadata = buildPageMetadata({ title: "Actualizaciones por correo", description: "Elegí los correos de The Prayer Whiteboard que querás recibir.", path: "/espanol/suscribirse", language: "es", pair: STATIC_TRANSLATIONS.subscribe });

export default function SuscribirsePage() {
  return (
    <main lang="es" className="min-h-screen bg-[#f7f2e8] text-[#243126]">
      <PublicHeader variant="es" maxWidthClassName="max-w-4xl" end={<Link href="/espanol" className="shrink-0 text-sm font-extrabold text-[#244a3a]">Inicio</Link>} />
      <section className="mx-auto max-w-4xl px-5 py-10 sm:px-8 sm:py-16">
        <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#946332]">Actualizaciones por correo</p>
        <SubscribeFormEs />
      </section>
      <PublicFooterEs englishHref={STATIC_TRANSLATIONS.subscribe.en} />
      <ReturnToTop />
    </main>
  );
}
