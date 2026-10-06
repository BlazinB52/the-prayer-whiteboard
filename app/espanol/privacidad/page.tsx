import type { Metadata } from "next";
import Link from "next/link";
import { PublicFooterEs } from "@/app/public-footer-es";
import { PublicHeader } from "@/app/public-header";

// Spanish translation of /privacy, drafted for review. Keep it in step with the English policy.
export const metadata: Metadata = {
  title: "Política de privacidad",
  description: "Cómo The Prayer Whiteboard maneja la información de suscripción por correo electrónico.",
  alternates: { canonical: "/espanol/privacidad" },
};

export default function PoliticaDePrivacidadPage() {
  return (
    <main lang="es" className="min-h-screen bg-[#f7f2e8] text-[#243126]">
      <PublicHeader variant="es" maxWidthClassName="max-w-4xl" end={<Link href="/espanol" className="shrink-0 text-sm font-extrabold text-[#244a3a]">Inicio</Link>} />
      <article className="mx-auto max-w-4xl px-5 py-10 leading-7 text-[#52645a] sm:px-8 sm:py-16">
        <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#946332]">Privacidad</p>
        <h1 className="mt-3 text-4xl font-extrabold tracking-tight text-[#243d31] sm:text-6xl">Política de privacidad</h1>
        <p className="mt-6">The Prayer Whiteboard usa la información que usted proporciona para enviar las actualizaciones por correo electrónico que usted elija y para administrar sus preferencias de suscripción.</p>
        <h2 className="mt-8 text-2xl font-extrabold text-[#243d31]">Información que recopilamos</h2>
        <p className="mt-3">Los formularios de suscripción por correo electrónico recopilan su nombre, su dirección de correo electrónico, las categorías de correo que seleccione, el estado de su consentimiento y el historial de sus preferencias. Los códigos de seguridad se almacenan únicamente como valores cifrados (hash).</p>
        <h2 className="mt-8 text-2xl font-extrabold text-[#243d31]">Cómo la usamos</h2>
        <p className="mt-3">Usamos la información de suscripción para enviar enlaces de confirmación, enlaces para administrar preferencias, las Actualizaciones Semanales, las nuevas enseñanzas y los correos de devocionales que usted haya elegido recibir.</p>
        <h2 className="mt-8 text-2xl font-extrabold text-[#243d31]">Sus opciones</h2>
        <p className="mt-3">Usted puede cambiar las categorías o cancelar la suscripción a todos los correos de The Prayer Whiteboard mediante un enlace seguro de preferencias de un solo uso. Puede solicitarlo en la página de Preferencias de correo electrónico.</p>
        <h2 className="mt-8 text-2xl font-extrabold text-[#243d31]">Protección de datos</h2>
        <p className="mt-3">Los registros de suscriptores no se publican. El acceso administrativo está limitado a administradores autorizados, y los visitantes del sitio no pueden consultar los datos de suscriptores ni el historial de consentimiento.</p>
        <h2 className="mt-8 text-2xl font-extrabold text-[#243d31]">Contacto</h2>
        <p className="mt-3">Las preguntas sobre esta política pueden enviarse a <a href="mailto:theprayerwhiteboard@gmail.com" className="font-bold text-[#9d5a2f] underline underline-offset-2">theprayerwhiteboard@gmail.com</a>.</p>
      </article>
      <PublicFooterEs />
    </main>
  );
}
