import type { Metadata } from "next";
import Link from "next/link";
import { createFooter, updateCopyrightDisclaimer } from "./actions";
import { loadFooterAssignments } from "./assignments";
import { CopyrightDisclaimerForm, FooterForm } from "./footer-form";
import { FormattedTextBlocks } from "@/app/formatted-text";
import { requireAdmin } from "@/lib/supabase/admin";

export const metadata: Metadata = {
  title: "Reusable Footers",
  robots: { index: false, follow: false },
};

type FooterRow = { id: string; internal_title: string; status: string; updated_at: string };

function FooterGroup({ heading, id, footers, assignmentsByFooter, emptyText }: { heading: string; id: string; footers: FooterRow[]; assignmentsByFooter: Map<string, string[]>; emptyText: string }) {
  return (
    <section aria-labelledby={id} className="mt-8">
      <h3 id={id} className="border-b border-[#284a3b]/10 pb-3 text-xl font-extrabold text-[#243d31]">
        {heading} <span className="text-sm font-bold text-[#607066]">({footers.length})</span>
      </h3>
      {footers.length ? (
        <ul className="divide-y divide-[#284a3b]/10">
          {footers.map((footer) => {
            const assignmentCount = (assignmentsByFooter.get(footer.id) ?? []).length;
            return (
              <li key={footer.id}>
                <Link href={`/admin/footers/${footer.id}`} className="flex min-h-12 items-center gap-3 px-2 py-2 transition hover:bg-[#e7efe9]/60">
                  <span className="min-w-0 flex-1 truncate font-extrabold text-[#243d31]">{footer.internal_title}</span>
                  <span className="rounded-full bg-[#e7efe9] px-3 py-1 text-[10px] font-black uppercase tracking-wider text-[#326048]">{footer.status}</span>
                  <span className="hidden rounded-full bg-[#eee7da] px-3 py-1 text-[10px] font-black uppercase tracking-wider text-[#6b5a3a] sm:inline">{assignmentCount ? `${assignmentCount} assigned` : "Unassigned"}</span>
                  <span className="hidden w-28 shrink-0 text-right text-sm text-[#607066] sm:inline">{new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(footer.updated_at))}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="py-4 text-sm text-[#607066]">{emptyText}</p>
      )}
    </section>
  );
}

export default async function AdminFootersPage() {
  const { supabase } = await requireAdmin();
  const [{ data: footers, error }, { data: copyrightDisclaimers, error: copyrightError }] = await Promise.all([
    supabase.from("content_footers").select("id, internal_title, language, status, updated_at").order("status", { ascending: true }).order("internal_title", { ascending: true }),
    supabase.from("copyright_disclaimers").select("disclaimer_key, title, content, updated_at").in("disclaimer_key", ["full_page", "email_short"]).order("disclaimer_key", { ascending: true }),
  ]);

  const assignmentsByFooter = await loadFooterAssignments(supabase);

  return (
    <main className="admin-shell">
      <div className="mx-auto max-w-5xl">
        <Link href="/admin" className="text-sm font-extrabold text-[#946332] hover:text-[#a85e32]">Back to dashboard</Link>
        <header className="mt-4 border-b border-[#284a3b]/10 pb-8">
          <h1 className="text-4xl font-extrabold tracking-tight text-[#243d31]">Footers</h1>
          <p className="mt-3 text-sm text-[#607066]">Create reusable footer text and assign it from teaching or Weekly Update editors.</p>
        </header>

        <section className="py-8">
          <article className="rounded-2xl border border-[#284a3b]/10 bg-[#fffdf8] p-5 shadow-lg shadow-[#4d5f52]/8">
            <h2 className="text-2xl font-extrabold text-[#243d31]">New footer</h2>
            <div className="mt-5"><FooterForm action={createFooter} submitLabel="Create footer" /></div>
          </article>
        </section>

        <section className="border-t border-[#284a3b]/10 py-8">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#946332]">Copyright Disclaimers</p>
              <h2 className="mt-2 text-2xl font-extrabold text-[#243d31]">Centrally managed notices</h2>
              <p className="mt-2 text-sm text-[#607066]">These are separate from ordinary reusable footers and are rendered by the public copyright page and outbound email helpers.</p>
            </div>
            <Link href="/copyright-disclaimers" className="text-sm font-extrabold text-[#946332] hover:text-[#a85e32]">View public page</Link>
          </div>
          {copyrightError ? <p className="mt-4 text-sm font-bold text-[#a2472c]">Copyright disclaimers could not be loaded.</p> : null}
          <div className="mt-5 grid gap-5">
            {(["full_page", "email_short"] as const).map((key) => {
              const disclaimer = copyrightDisclaimers?.find((item) => item.disclaimer_key === key);
              if (!disclaimer) {
                return (
                  <article key={key} className="rounded-2xl border border-[#a2472c]/20 bg-[#fff3ed] p-5 text-sm font-bold text-[#a2472c]">
                    {key === "full_page" ? "Full page" : "Email short"} copyright disclaimer is missing.
                  </article>
                );
              }

              return (
                <article key={disclaimer.disclaimer_key} className="rounded-2xl border border-[#284a3b]/10 bg-[#fffdf8] p-5 shadow-lg shadow-[#4d5f52]/8">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#946332]">{disclaimer.disclaimer_key === "full_page" ? "Public page" : "Email footer"}</p>
                      <h3 className="mt-2 text-2xl font-extrabold text-[#243d31]">{disclaimer.title}</h3>
                      <p className="mt-2 text-sm text-[#607066]">Updated: {new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(disclaimer.updated_at))}</p>
                    </div>
                  </div>
                  <div className="mt-5 rounded-xl border border-[#284a3b]/10 bg-white p-4 text-sm leading-6 text-[#52645a]">
                    <FormattedTextBlocks text={disclaimer.content} links className="space-y-3" />
                  </div>
                  <details className="mt-5">
                    <summary className="cursor-pointer text-sm font-extrabold text-[#9d5a2f]">Edit disclaimer</summary>
                    <div className="mt-4"><CopyrightDisclaimerForm action={updateCopyrightDisclaimer.bind(null, disclaimer.disclaimer_key)} title={disclaimer.title} content={disclaimer.content} /></div>
                  </details>
                </article>
              );
            })}
          </div>
        </section>

        <section className="border-t border-[#284a3b]/10 py-8">
          <h2 className="text-2xl font-extrabold text-[#243d31]">Footer library</h2>
          {error ? <p className="mt-4 text-sm font-bold text-[#a2472c]">Footers could not be loaded.</p> : null}
          {footers?.length ? (
            <>
              <FooterGroup heading="English" id="footers-en" footers={footers.filter((footer) => footer.language !== "es")} assignmentsByFooter={assignmentsByFooter} emptyText="No English footers yet." />
              <FooterGroup heading="Español (El Salvador)" id="footers-es" footers={footers.filter((footer) => footer.language === "es")} assignmentsByFooter={assignmentsByFooter} emptyText="Aún no hay pies de página en español." />
            </>
          ) : <p className="mt-4 text-sm text-[#607066]">No footers have been created yet.</p>}
        </section>
      </div>
    </main>
  );
}
