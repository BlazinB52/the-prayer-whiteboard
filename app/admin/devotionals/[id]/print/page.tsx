import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PrintPreviewButton } from "@/app/admin/cm/print-preview-button";
import { PrintableDevotional } from "@/app/admin/devotionals/printable-devotional";
import { DEVOTIONAL_DAY_COLUMNS, type DevotionalDay } from "@/lib/devotionals";
import { requireAdmin } from "@/lib/supabase/admin";

export const metadata: Metadata = {
  title: "Print Preview - Devotional",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// What the devotional looks like on paper: the saved title, introduction and seven days, without the editing tools.
// It only reads. Nothing here can change the devotional, and it works on a draft or a published one.
export default async function AdminDevotionalPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) notFound();

  const { supabase } = await requireAdmin();
  const { data: devotional } = await supabase
    .from("teaching_devotionals")
    .select("id, title, introduction, language, gathering_date")
    .eq("id", id)
    .maybeSingle();
  if (!devotional) notFound();

  const { data: days } = await supabase
    .from("teaching_devotional_days")
    .select(DEVOTIONAL_DAY_COLUMNS)
    .eq("devotional_id", devotional.id)
    .order("day_number", { ascending: true });

  return (
    <main className="min-h-screen bg-[#eee7da] px-4 py-6 text-[#243126] sm:px-8 sm:py-10">
      <div className="print-controls mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 pb-5">
        <Link href={`/admin/devotionals/${devotional.id}`} className="admin-secondary-button inline-flex items-center justify-center"><span>Back to the Devotional</span></Link>
        <PrintPreviewButton label="Print Devotional" />
      </div>
      <p className="print-controls mx-auto mb-4 max-w-3xl text-sm text-[#607066]">This is the saved text. Save any edits first, or they will not appear here. Each day after the first starts on a new page.</p>
      <PrintableDevotional devotional={devotional} days={(days ?? []) as unknown as DevotionalDay[]} />
    </main>
  );
}
