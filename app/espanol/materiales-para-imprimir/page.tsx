import type { Metadata } from "next";
import { buildPageMetadata, STATIC_TRANSLATIONS } from "@/lib/alternates";
import { FileText } from "lucide-react";
import { PublicFooterEs } from "@/app/public-footer-es";
import { PublicHeader } from "@/app/public-header";
import { ReturnToTop } from "@/app/return-to-top";
import { resolvePrintablePdfHref } from "@/lib/printable-pdf-links";
import { createClient } from "@/lib/supabase/server";

const nav = [
  { href: "/espanol", label: "Inicio" },
  { href: "/espanol#ultima", label: "Última enseñanza" },
  { href: "/espanol#profundo", label: "Estudios profundos" },
  { href: "/espanol#devocionales", label: "Devocionales" },
  { href: "/espanol/recursos-para-maestros", label: "Recursos para maestros" },
  { href: "/", label: "English" },
];

export const metadata: Metadata = buildPageMetadata({ title: "Materiales para imprimir", description: "Recursos para imprimir de The Prayer Whiteboard.", path: "/espanol/materiales-para-imprimir", language: "es", pair: STATIC_TRANSLATIONS.printables });

type PrintablePdfLinkRow = { id: string; title: string; storage_path: string; created_at: string };

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es", { dateStyle: "long" }).format(new Date(value));
}

export default async function MaterialesParaImprimirPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("printable_pdf_links")
    .select("id, title, storage_path, created_at")
    .eq("language", "es")
    .order("created_at", { ascending: false })
    .order("title", { ascending: true });
  const links = ((data as PrintablePdfLinkRow[] | null) ?? []).map((link) => ({
    ...link,
    href: resolvePrintablePdfHref(link.storage_path, supabase),
  }));

  return (
    <main lang="es" className="min-h-screen bg-[#f7f2e8] text-[#243126]">
      <PublicHeader variant="es" maxWidthClassName="max-w-5xl" nav={nav} />
      <section className="border-b border-[#284a3b]/10 bg-[#20382e] px-5 py-10 text-white sm:px-8 sm:py-14">
        <div className="mx-auto max-w-5xl">
          <FileText aria-hidden="true" size={28} className="text-[#f0cb83]" />
          <h1 className="mt-4 text-4xl font-extrabold tracking-tight sm:text-5xl">Materiales para imprimir</h1>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-5 py-10 sm:px-8 sm:py-14">
        {error ? (
          <p className="text-sm font-bold text-[#a2472c]">No se pudieron cargar los materiales para imprimir.</p>
        ) : !links.length ? (
          <p className="text-[#607066]">Todavía no hay materiales para imprimir.</p>
        ) : (
          <div className="divide-y divide-[#284a3b]/10 border-y border-[#284a3b]/10 bg-[#fffdf8]">
            {links.map((link) => (
              <article key={link.id} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 px-4 py-4">
                <h2 className="min-w-0 font-extrabold text-[#243d31]">{link.title}</h2>
                <a href={link.href} target="_blank" rel="noopener noreferrer" className="row-span-2 font-bold text-[#946332] underline underline-offset-2 hover:text-[#a85e32]">Ver PDF</a>
                <time dateTime={link.created_at} className="text-sm text-[#607066]">{formatDate(link.created_at)}</time>
              </article>
            ))}
          </div>
        )}
      </section>
      <PublicFooterEs englishHref="/pdf" />
      <ReturnToTop />
    </main>
  );
}
