import type { Metadata } from "next";
import Link from "next/link";
import { FormattedTextBlocks } from "@/app/formatted-text";
import { PublicFooterEs } from "@/app/public-footer-es";
import { PublicHeader } from "@/app/public-header";
import { ESPANOL_COPYRIGHT_FOOTER_ID } from "@/lib/espanol-constants";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

// Displays the long Español (El Salvador) copyright footer; edit that footer in /admin/footers to change it.
// Public access to footers is limited to ones assigned to published content, so this reads that one
// footer id on the server instead.
export const metadata: Metadata = {
  title: "Derechos de autor",
  description: "Reconocimientos de derechos de autor y permisos de The Prayer Whiteboard.",
  alternates: { canonical: "/espanol/derechos-de-autor" },
};

export default async function EspanolCopyrightPage() {
  const supabase = createServiceRoleClient();
  const { data } = supabase
    ? await supabase
        .from("content_footers")
        .select("content")
        .eq("id", ESPANOL_COPYRIGHT_FOOTER_ID)
        .eq("status", "active")
        .maybeSingle()
    : { data: null };
  const content = data?.content?.trim();

  return (
    <main lang="es" className="min-h-screen bg-[#f7f2e8] text-[#243126]">
      <PublicHeader variant="es" maxWidthClassName="max-w-4xl" nav={[{ href: "/espanol", label: "Inicio" }, { href: "/", label: "English" }]} />
      <article className="mx-auto max-w-4xl px-5 py-10 sm:px-8 sm:py-16">
        <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#946332]">Derechos de autor</p>
        <h1 className="mt-3 text-4xl font-extrabold tracking-tight text-[#243d31] sm:text-6xl">Derechos de autor</h1>
        <div className="mt-8 rounded-2xl border border-[#284a3b]/10 bg-[#fffdf8] p-5 leading-7 text-[#52645a] shadow-lg shadow-[#4d5f52]/8 sm:p-7">
          {content ? (
            <FormattedTextBlocks text={content} links className="space-y-5" paragraphClassName="whitespace-pre-wrap" />
          ) : (
            <p>Los reconocimientos de derechos de autor no están disponibles en este momento.</p>
          )}
        </div>
        <Link href="/espanol" className="mt-8 inline-flex min-h-12 items-center justify-center rounded-2xl bg-[#244a3a] px-5 font-extrabold !text-white shadow-xl shadow-[#244a3a]/20 transition hover:bg-[#1d3d30]">
          Volver a The Prayer Whiteboard
        </Link>
      </article>
      <PublicFooterEs />
    </main>
  );
}
