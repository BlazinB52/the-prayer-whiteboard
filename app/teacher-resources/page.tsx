import type { Metadata } from "next";
import { OutlineLibraryPage } from "@/app/teaching-outlines/public-outlines";

export const metadata: Metadata = {
  title: "Teacher Resources",
  description: "Teaching outlines to help you teach and lead discussion, organized by category.",
  alternates: { canonical: "/teacher-resources", languages: { en: "/teacher-resources", es: "/espanol/recursos-para-maestros" } },
};

export default function TeacherResourcesPage() {
  return <OutlineLibraryPage language="en" />;
}
