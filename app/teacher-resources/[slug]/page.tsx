import type { Metadata } from "next";
import { OutlineDetailPage, getPublishedOutlineMetadata } from "@/app/teaching-outlines/public-outlines";
import { buildPageMetadata } from "@/lib/alternates";
import { NOINDEX } from "@/lib/seo";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const outline = await getPublishedOutlineMetadata(slug, "en");
  if (!outline) return { title: "Teacher Resources", robots: NOINDEX };
  return buildPageMetadata({ title: outline.title, description: outline.subtitle ?? "A teaching outline from The Prayer Whiteboard.", path: `/teacher-resources/${slug}`, type: "article" });
}

export default async function TeacherResourcePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <OutlineDetailPage slug={slug} language="en" />;
}
