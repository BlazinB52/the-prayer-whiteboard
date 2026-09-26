import type { Metadata } from "next";
import { FileText } from "lucide-react";
import { PublicFooter } from "@/app/public-footer";
import { PublicHeader } from "@/app/public-header";
import { ReturnToTop } from "@/app/return-to-top";
import { createClient } from "@/lib/supabase/server";

const pdfNavigation = [
  { href: "/", label: "Home" },
  { href: "/#latest", label: "Latest Teaching" },
  { href: "/deep-dives", label: "Deep Dives" },
  { href: "/devotionals", label: "Devotionals" },
  { href: "/points-of-agreement", label: "Prayer Guide" },
  { href: "/subscribe", label: "Email Updates" },
];

export const metadata: Metadata = {
  title: "Printable PDF Links",
  description: "Printable resources from The Prayer Whiteboard.",
  alternates: { canonical: "https://theprayerwhiteboard.com/pdf" },
};

type PrintablePdfLink = {
  id: string;
  title: string;
  printable_pdf_url: string;
  created_at: string;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(value));
}

export default async function PrintablePdfLinksPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("printable_pdf_links")
    .select("id, title, printable_pdf_url, created_at")
    .order("created_at", { ascending: false })
    .order("title", { ascending: true });
  const links = (data as PrintablePdfLink[] | null) ?? [];

  return (
    <main className="min-h-screen bg-[#f7f2e8] text-[#243126]">
      <PublicHeader maxWidthClassName="max-w-5xl" nav={pdfNavigation} />
      <section className="border-b border-[#284a3b]/10 bg-[#20382e] px-5 py-10 text-white sm:px-8 sm:py-14">
        <div className="mx-auto max-w-5xl">
          <FileText aria-hidden="true" size={28} className="text-[#f0cb83]" />
          <h1 className="mt-4 text-4xl font-extrabold tracking-tight sm:text-5xl">Printable PDF Links</h1>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-5 py-10 sm:px-8 sm:py-14">
        {error ? (
          <p className="text-sm font-bold text-[#a2472c]">Printable PDF links could not be loaded.</p>
        ) : !links.length ? (
          <p className="text-[#607066]">No printable PDF links have been added yet.</p>
        ) : (
          <>
            <div className="divide-y divide-[#284a3b]/10 border-y border-[#284a3b]/10 bg-[#fffdf8] md:hidden">
              {links.map((link) => (
                <article key={link.id} className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 px-4 py-4">
                  <h2 className="min-w-0 font-extrabold text-[#243d31]">{link.title}</h2>
                  <a href={link.printable_pdf_url} target="_blank" rel="noopener noreferrer" className="row-span-2 self-center font-bold text-[#946332] underline underline-offset-2 hover:text-[#a85e32]">View PDF</a>
                  <time dateTime={link.created_at} className="text-sm text-[#607066]">{formatDate(link.created_at)}</time>
                </article>
              ))}
            </div>

            <div className="hidden border-y border-[#284a3b]/10 md:block">
              <table className="w-full border-collapse text-left text-sm">
                <thead className="bg-[#eee7da] text-xs font-extrabold uppercase tracking-wide text-[#385245]">
                  <tr>
                    <th scope="col" className="px-4 py-3">Title</th>
                    <th scope="col" className="w-44 px-4 py-3">Date</th>
                    <th scope="col" className="w-32 px-4 py-3">PDF</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#284a3b]/10 bg-[#fffdf8]">
                  {links.map((link) => (
                    <tr key={link.id}>
                      <td className="px-4 py-4 font-bold text-[#243d31]">{link.title}</td>
                      <td className="whitespace-nowrap px-4 py-4 text-[#607066]">
                        <time dateTime={link.created_at}>{formatDate(link.created_at)}</time>
                      </td>
                      <td className="whitespace-nowrap px-4 py-4">
                        <a href={link.printable_pdf_url} target="_blank" rel="noopener noreferrer" className="font-bold text-[#946332] underline underline-offset-2 hover:text-[#a85e32]">View PDF</a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
      <PublicFooter />
      <ReturnToTop />
    </main>
  );
}
