import type { Metadata } from "next";
import { buildPageMetadata, STATIC_TRANSLATIONS } from "@/lib/alternates";
import { OutlineLibraryPage } from "@/app/teaching-outlines/public-outlines";

export const metadata: Metadata = buildPageMetadata({ title: "Recursos para maestros", description: "Bosquejos de enseñanza para ayudarte a enseñar y a guiar la conversación, organizados por categoría.", path: "/espanol/recursos-para-maestros", language: "es", pair: STATIC_TRANSLATIONS.teacherResources });

export default function RecursosParaMaestrosPage() {
  return <OutlineLibraryPage language="es" />;
}
