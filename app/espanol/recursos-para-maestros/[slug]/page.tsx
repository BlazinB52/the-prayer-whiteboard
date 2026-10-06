import type { Metadata } from "next";
import { OutlineDetailPage, getPublishedOutlineMetadata } from "@/app/teaching-outlines/public-outlines";
import { NOINDEX } from "@/lib/seo";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const outline = await getPublishedOutlineMetadata(slug, "es");
  if (!outline) return { title: "Recursos para maestros", robots: NOINDEX };
  return {
    title: outline.title,
    description: outline.subtitle ?? "Un bosquejo de enseñanza de The Prayer Whiteboard.",
    alternates: { canonical: `/espanol/recursos-para-maestros/${slug}` },
  };
}

export default async function RecursoParaMaestrosPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <OutlineDetailPage slug={slug} language="es" />;
}
