import type { Metadata } from "next";
import { OutlineLibraryPage } from "@/app/teaching-outlines/public-outlines";

export const metadata: Metadata = {
  title: "Recursos para maestros",
  description: "Bosquejos de enseñanza para ayudarte a enseñar y a guiar la conversación, organizados por categoría.",
  alternates: { canonical: "/espanol/recursos-para-maestros", languages: { en: "/teacher-resources", es: "/espanol/recursos-para-maestros" } },
};

export default function RecursosParaMaestrosPage() {
  return <OutlineLibraryPage language="es" />;
}
