import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/alternates";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PublicFooterEs } from "@/app/public-footer-es";
import { PublicHeader } from "@/app/public-header";
import { ReturnToTop } from "@/app/return-to-top";
import { ContentFooter } from "@/app/content-footer";
import { createClient } from "@/lib/supabase/server";
import { WeeklyUpdateContent } from "@/app/weekly-update/weekly-update-content";
import { WeeklyUpdatePrintButton } from "@/app/weekly-update/print-button";

export const metadata: Metadata = buildPageMetadata({ title: "Actualización semanal", description: "La actualización semanal más reciente de The Prayer Whiteboard.", path: "/espanol/actualizacion-semanal", language: "es" });

export const dynamic = "force-dynamic";
export const revalidate = 0;

// The Español weekly update. It reads the Español-only view, so an English update can never appear here.
export default async function ActualizacionSemanalPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("public_current_weekly_update_es")
    .select("id, title, body_markdown, converted_content, published_at")
    .maybeSingle();

  if (error || !data) notFound();
  const { data: footerAssignment } = await supabase
    .from("weekly_update_footer_assignments")
    .select("footer_id")
    .eq("weekly_update_id", data.id)
    .maybeSingle();
  const { data: footer } = footerAssignment?.footer_id
    ? await supabase
        .from("content_footers")
        .select("content, status")
        .eq("id", footerAssignment.footer_id)
        .eq("status", "active")
        .maybeSingle()
    : { data: null };

  return (
    <main lang="es" className="min-h-screen bg-[#f7f2e8] text-[#243126]">
      <PublicHeader variant="es" maxWidthClassName="max-w-4xl" end={<Link href="/espanol" className="shrink-0 text-sm font-extrabold text-[#244a3a]">Inicio</Link>} />
      <div className="sticky top-[73px] z-30 border-b border-[#284a3b]/10 bg-[#f7f2e8]/95 px-5 py-2 backdrop-blur sm:px-8">
        <div className="mx-auto flex max-w-4xl justify-end">
          <WeeklyUpdatePrintButton label="Imprimir" />
        </div>
      </div>
      <article className="mx-auto max-w-4xl px-5 py-10 sm:px-8 sm:py-16">
        <header className="border-b border-[#284a3b]/15 pb-8">
          <div className="mb-8 flex justify-center">
            <Image
              src="/images/whiteboard-sword-logo-with-tagline.png"
              alt="Logotipo de The Prayer Whiteboard con la espada y el lema"
              width={2172}
              height={724}
              className="h-auto w-full max-w-[520px]"
              priority
            />
          </div>
          <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#946332]">Actualización semanal</p>
          <h1 className="mt-3 text-[24px] font-extrabold leading-[1.08] tracking-normal text-[#243d31] sm:text-[40px] lg:text-[32px]">{data.title}</h1>
          {data.published_at ? <p className="mt-4 text-sm font-bold text-[#607066]">{new Intl.DateTimeFormat("es-SV", { dateStyle: "long" }).format(new Date(data.published_at))}</p> : null}
        </header>
        <div className="mt-10">
          <WeeklyUpdateContent body={data.body_markdown} blocks={data.converted_content} />
          {footer?.status === "active" ? <ContentFooter content={footer.content} /> : null}
        </div>
      </article>
      <section lang="es" className="px-5 pb-12 text-center sm:px-8">
        <p className="mx-auto max-w-2xl text-base text-[#385245]">¿Querés recibir esta actualización semanal y otros contenidos de The Prayer Whiteboard? Elegí los correos que querés recibir.</p>
        <Link href="/espanol/suscribirse" className="mt-4 inline-flex min-h-11 items-center justify-center rounded-2xl bg-[#244a3a] px-5 text-sm font-extrabold !text-white">Suscribirme</Link>
      </section>
      <PublicFooterEs />
      <ReturnToTop />
    </main>
  );
}
