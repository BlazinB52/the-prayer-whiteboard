import type { Metadata } from "next";
import { buildPageMetadata, STATIC_TRANSLATIONS } from "@/lib/alternates";
import { OutlineLibraryPage } from "@/app/teaching-outlines/public-outlines";

export const metadata: Metadata = buildPageMetadata({ title: "Teacher Resources", description: "Teaching outlines to help you teach and lead discussion, organized by category.", path: "/teacher-resources", pair: STATIC_TRANSLATIONS.teacherResources });

export default function TeacherResourcesPage() {
  return <OutlineLibraryPage language="en" />;
}
