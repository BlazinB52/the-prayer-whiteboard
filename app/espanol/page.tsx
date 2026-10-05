/* eslint-disable @next/next/no-img-element */
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpenText, CalendarDays, Layers, Sparkles } from "lucide-react";
import { PublicHeader } from "@/app/public-header";
import { ReturnToTop } from "@/app/return-to-top";
import { formatInlineText } from "@/app/formatted-text";
import { getEspanolHomepageData } from "@/lib/espanol-home-data";

export const metadata: Metadata = {
  title: { absolute: "The Prayer Whiteboard | Oración y Escritura" },
  description: "Un lugar de encuentro para las enseñanzas del grupo de oración y para crecer juntos en la Palabra de Dios.",
  alternates: { canonical: "/espanol", languages: { en: "/", es: "/espanol" } },
  robots: { index: true, follow: true },
};

const nav = [
  { href: "#ultima", label: "Última enseñanza" },
  { href: "#almacen", label: "El Almacén" },
  { href: "#profundo", label: "Estudios profundos" },
  { href: "#devocionales", label: "Devocionales" },
  { href: "/", label: "English" },
];

function formatDate(value: string | null) {
  if (!value) return "Fecha por confirmar";
  return new Intl.DateTimeFormat("es", { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}

export default async function EspanolHomePage() {
  const data = await getEspanolHomepageData();
  const { featured } = data;

  return (
    <main lang="es" className="min-h-screen overflow-hidden bg-[#f7f2e8] text-[#243126]">
      <PublicHeader variant="es" maxWidthClassName="max-w-6xl" nav={nav} />

      <section className="relative">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_85%_12%,rgba(209,159,83,0.22),transparent_28%),radial-gradient(circle_at_8%_75%,rgba(58,103,79,0.15),transparent_30%)]" />
        <div className="relative mx-auto grid max-w-6xl gap-9 px-5 pb-14 pt-12 sm:px-8 sm:pt-16 lg:grid-cols-[1.02fr_0.98fr] lg:items-center lg:py-20">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-[#b98243]/25 bg-[#fffaf0] px-4 py-2 text-xs font-extrabold uppercase tracking-[0.16em] text-[#875624]">
              <Sparkles aria-hidden="true" size={15} />
              Bienvenido a nuestro lugar de encuentro
            </p>
            <h1 className="mt-6 max-w-2xl text-5xl font-extrabold leading-[0.98] tracking-[-0.045em] text-[#20382e] sm:text-6xl lg:text-7xl">
              La oración cambia las cosas. <span className="text-[#a85e32]">La Palabra nos cambia a nosotros.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-[#52645a]">
              Un lugar para volver a nuestras enseñanzas, estar juntos en oración y celebrar lo que Dios está haciendo entre nosotros.
            </p>
          </div>
          <div className="relative mx-auto w-full max-w-[510px]">
            {data.chalkboard ? (
              <>
                <div className="absolute -inset-3 rotate-2 rounded-[2rem] bg-[#bb7a3c]/18" />
                <div className="relative -rotate-1 rounded-[1.75rem] border border-[#284a3b]/10 bg-white p-3 shadow-2xl shadow-[#2d4639]/20 sm:p-4">
                  <a href={data.chalkboard.url} target="_blank" rel="noreferrer" aria-label="Ver la pizarra más grande">
                    <img src={data.chalkboard.url} alt={data.chalkboard.altText} className="h-auto w-full rounded-2xl object-contain" />
                  </a>
                  {data.chalkboard.caption ? <p className="mt-3 text-center text-sm text-[#607066]">{data.chalkboard.caption}</p> : null}
                  {featured ? (
                    <div className="absolute -bottom-4 left-5 right-5 rounded-2xl bg-[#fffdf8] px-4 py-3 text-center shadow-lg ring-1 ring-[#284a3b]/10">
                      <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#9a642e]">La pizarra de esta semana</p>
                      <p className="mt-1 font-extrabold text-[#263f33]">{featured.title}</p>
                    </div>
                  ) : null}
                </div>
              </>
            ) : (
              <div className="rounded-[1.75rem] border border-[#284a3b]/10 bg-[#fffdf8] p-8 text-center shadow-xl">
                <p className="text-sm font-bold text-[#607066]">La pizarra estará disponible pronto</p>
              </div>
            )}
          </div>
        </div>
      </section>

      {featured ? (
        <section id="ultima" className="scroll-mt-20 bg-[#244a3a] px-5 py-14 text-white sm:px-8 sm:py-20">
          <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[0.72fr_1.28fr] lg:items-start">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-[#f0cb83]">{formatDate(featured.gathering_date)}</p>
              <h2 className="mt-4 text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">{featured.title}</h2>
              <p className="mt-5 text-base leading-7 text-[#dce8e1]">{formatInlineText(featured.central_theme || featured.introduction || "")}</p>
              <div className="mt-7 flex flex-col items-start gap-2">
                <TextLink href={`/teachings/${featured.slug}`} label="Leer la enseñanza completa" dark />
                {featured.devotionalSlug ? <TextLink href={`/devotionals/${featured.devotionalSlug}`} label="Abrir el devocional de 7 días" dark /> : null}
              </div>
            </div>
            {data.teasers.length ? (
              <div className="grid gap-4 sm:grid-cols-2">
                {data.teasers.map((teaser, index) => (
                  <Link key={teaser.id} href={`/teachings/${featured.slug}`} className="group flex min-h-56 flex-col rounded-3xl border border-white/10 bg-white/[0.07] p-5 text-left text-[#dce8e1] transition hover:-translate-y-0.5 hover:bg-white/[0.11]">
                    <span className="grid size-9 place-items-center rounded-full bg-[#f1c66f] text-sm font-black text-[#244a3a]">{index + 1}</span>
                    <h3 className="mt-4 text-xl font-extrabold text-white">{formatInlineText(teaser.heading)}</h3>
                    <p className="mt-3 text-sm leading-6 text-[#dce8e1]">{formatInlineText(teaser.text)}</p>
                    <span className="mt-auto inline-flex items-center gap-2 pt-5 text-sm font-extrabold text-[#f0cb83]">Leer la enseñanza completa <ArrowRight aria-hidden="true" size={16} /></span>
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
        </section>
      ) : (
        <section id="ultima" className="scroll-mt-20 bg-[#244a3a] px-5 py-14 text-center text-white sm:px-8 sm:py-20">
          <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Muy pronto habrá enseñanzas en español</h2>
          <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-[#dce8e1]">Estamos preparando las enseñanzas. Vuelve pronto.</p>
        </section>
      )}

      <section id="almacen" className="scroll-mt-20 border-y border-[#284a3b]/10 bg-[#eee7da] px-5 py-14 sm:px-8 sm:py-20">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#946332]">Vuelve a la Palabra</p>
              <h2 className="mt-2 text-4xl font-extrabold tracking-tight text-[#243d31]">El Almacén</h2>
            </div>
            <p className="max-w-md text-sm leading-6 text-[#607066]">Las enseñanzas publicadas se organizan por fecha de reunión para que sean fáciles de encontrar después.</p>
          </div>
          {data.gatherings.length ? (
            <div className="mt-8 grid gap-4 md:grid-cols-3">
              {data.gatherings.map((gathering) => (
                <article key={gathering.id} className="flex flex-col rounded-2xl border border-[#284a3b]/10 bg-[#fffdf8] p-5">
                  <h3 className="text-lg font-extrabold leading-6 text-[#263e33]">{gathering.title}</h3>
                  <p className="mt-2 inline-flex items-center gap-2 text-sm font-bold text-[#607066]"><CalendarDays aria-hidden="true" size={16} /> {formatDate(gathering.gathering_date)}</p>
                  <div className="mt-4 border-t border-[#284a3b]/10 pt-3">
                    <TextLink href={`/teachings/${gathering.slug}`} label="Leer la enseñanza completa" />
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="mt-8 text-sm text-[#607066]">Aún no hay enseñanzas publicadas.</p>
          )}
        </div>
      </section>

      {data.deepDives.length ? (
        <section id="profundo" className="scroll-mt-20 bg-[#20382e] px-5 py-14 text-[#f8f1df] sm:px-8 sm:py-20">
          <div className="mx-auto max-w-6xl">
            <span className="grid size-12 place-items-center rounded-2xl bg-[#f0cb83] text-[#20382e]"><Layers aria-hidden="true" size={25} /></span>
            <p className="mt-6 text-xs font-extrabold uppercase tracking-[0.2em] text-[#f0cb83]">Estudio más profundo</p>
            <h2 className="mt-2 text-4xl font-extrabold tracking-tight text-white sm:text-5xl">Estudios profundos</h2>
            <div className="mt-8 grid gap-4 md:grid-cols-2">
              {data.deepDives.map((deepDive) => (
                <article key={deepDive.id} className="flex flex-col rounded-2xl border border-white/10 bg-white/[0.07] p-5">
                  <h3 className="text-xl font-extrabold text-white">{deepDive.title}</h3>
                  <p className="mt-2 text-sm font-bold text-[#f0cb83]">{formatDate(deepDive.gathering_date)}</p>
                  {deepDive.summary || deepDive.central_theme ? <p className="mt-3 text-sm leading-6 text-[#dce8e1]">{formatInlineText(deepDive.summary || deepDive.central_theme || "")}</p> : null}
                  <div className="mt-4"><TextLink href={`/teachings/${deepDive.slug}`} label="Leer el estudio completo" dark /></div>
                </article>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {data.devotionals.length ? (
        <section id="devocionales" className="scroll-mt-20 px-5 py-14 sm:px-8 sm:py-20">
          <div className="mx-auto max-w-6xl">
            <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#946332]">Una semana con la Palabra</p>
            <h2 className="mt-2 text-4xl font-extrabold tracking-tight text-[#243d31]">Devocionales de 7 días</h2>
            <div className="mt-8 grid gap-4 md:grid-cols-2">
              {data.devotionals.map((devotional) => (
                <article key={devotional.id} className="flex flex-col rounded-2xl border border-[#284a3b]/10 bg-[#fffdf8] p-5">
                  <h3 className="text-xl font-extrabold text-[#263e33]">{devotional.title}</h3>
                  <div className="mt-4"><TextLink href={`/devotionals/${devotional.slug}`} label="Abrir el devocional" /></div>
                </article>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <footer className="bg-[#1d352b] px-5 py-9 text-center text-[#d8e5dd] sm:px-8">
        <BookOpenText aria-hidden="true" className="mx-auto text-[#efc775]" size={28} />
        <p className="mt-4 text-lg font-extrabold text-white">The Prayer Whiteboard</p>
        <p className="mt-2 text-sm">Oración &middot; La Palabra &middot; Creciendo juntos</p>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-sm">
          <Link href="/" className="inline-flex min-h-10 items-center underline-offset-4 transition hover:text-[#f0cb83] hover:underline">English</Link>
          <Link href="/privacy" className="inline-flex min-h-10 items-center underline-offset-4 transition hover:text-[#f0cb83] hover:underline">Privacidad</Link>
          <Link href="/espanol/derechos-de-autor" className="inline-flex min-h-10 items-center underline-offset-4 transition hover:text-[#f0cb83] hover:underline">Derechos de autor</Link>
          <a href="mailto:theprayerwhiteboard@gmail.com" className="inline-flex min-h-10 items-center underline-offset-4 transition hover:text-[#f0cb83] hover:underline">Contacto</a>
        </div>
      </footer>
      <ReturnToTop />
    </main>
  );
}

function TextLink({ href, label, dark = false }: { href: string; label: string; dark?: boolean }) {
  const color = dark ? "text-[#f0cb83] hover:text-[#f5d58d]" : "text-[#9d5a2f] hover:text-[#a85e32]";
  return (
    <Link href={href} className={`group inline-flex min-h-11 max-w-full items-center gap-2 text-sm font-extrabold underline-offset-4 transition hover:underline focus-visible:rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#f1c66f] sm:text-base ${color}`}>
      <span>{label}</span>
      <ArrowRight aria-hidden="true" size={18} className="shrink-0 transition group-hover:translate-x-1 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0" />
    </Link>
  );
}
