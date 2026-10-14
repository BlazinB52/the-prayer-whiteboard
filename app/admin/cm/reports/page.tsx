import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/supabase/admin";

export const metadata: Metadata = {
  title: "Reports",
  robots: { index: false, follow: false },
};

const reports = [
  {
    title: "Title Collections",
    description: "Every teaching with its whiteboard, weekly update, handout, devotional and outline, in English and Español. See what is done, what is a draft, and what is missing.",
    href: "/admin/cm/reports/title-collections",
  },
];

export default async function ReportsPage() {
  await requireAdmin();

  return (
    <main className="admin-shell">
      <div className="mx-auto max-w-5xl">
        <Link href="/admin/cm" className="text-sm font-extrabold text-[#946332] hover:text-[#a85e32]">Back to Content Management</Link>
        <header className="mt-4 border-b border-[#284a3b]/10 pb-6">
          <h1 className="text-3xl font-extrabold tracking-tight text-[#243d31]">Reports</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#607066]">Read-only reports for the Administrator. Nothing here changes any content.</p>
        </header>
        <div className="grid gap-5 py-8 sm:grid-cols-2">
          {reports.map((report) => (
            <Link key={report.href} href={report.href} className="block focus-visible:rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#a85e32]">
              <article className="min-h-40 rounded-2xl border border-[#284a3b]/10 bg-[#fffdf8] p-6 shadow-lg shadow-[#4d5f52]/8 transition hover:-translate-y-0.5 hover:border-[#a85e32]/30">
                <h2 className="text-2xl font-extrabold text-[#243d31]">{report.title}</h2>
                <p className="mt-4 leading-7 text-[#607066]">{report.description}</p>
              </article>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
