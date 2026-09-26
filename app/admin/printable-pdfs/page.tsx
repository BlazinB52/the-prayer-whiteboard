import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/supabase/admin";
import { PrintablePdfManager } from "./printable-pdf-form";

export const metadata: Metadata = {
  title: "Printable PDF Links",
  robots: { index: false, follow: false },
};

type PrintablePdfLinkRow = {
  id: string;
  title: string;
  printable_pdf_url: string;
  created_at: string;
  updated_at: string;
};

export default async function AdminPrintablePdfsPage() {
  const { supabase } = await requireAdmin();

  const { data: links, error: linksError } = await supabase
    .from("printable_pdf_links")
    .select("id, title, printable_pdf_url, created_at, updated_at")
    .order("created_at", { ascending: false })
    .order("title", { ascending: true });

  return (
    <main className="admin-shell">
      <div className="mx-auto max-w-6xl">
        <Link href="/admin" className="text-sm font-extrabold text-[#946332] hover:text-[#a85e32]">Back to dashboard</Link>
        <header className="mt-4 border-b border-[#284a3b]/10 pb-6">
          <h1 className="text-3xl font-extrabold tracking-tight text-[#243d31]">Printable PDF Links</h1>
          <p className="mt-2 text-sm text-[#607066]">Add and maintain printable resources for the public PDF library.</p>
        </header>

        {linksError ? (
          <p className="mt-6 text-sm font-bold text-[#a2472c]">Printable PDF links could not be loaded.</p>
        ) : (
          <PrintablePdfManager links={(links as PrintablePdfLinkRow[] | null) ?? []} />
        )}
      </div>
    </main>
  );
}
