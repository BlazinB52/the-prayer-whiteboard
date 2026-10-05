import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { archiveFooter, deleteFooter, updateFooter } from "../actions";
import { loadFooterAssignments } from "../assignments";
import { ArchiveFooterButton } from "../archive-button";
import { FooterDeleteForm, FooterForm } from "../footer-form";
import { ContentFooter } from "@/app/content-footer";
import { requireAdmin } from "@/lib/supabase/admin";

export const metadata: Metadata = {
  title: "Edit Footer",
  robots: { index: false, follow: false },
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function AdminFooterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) notFound();

  const { supabase } = await requireAdmin();
  const { data: footer } = await supabase
    .from("content_footers")
    .select("id, internal_title, language, content, status, updated_at")
    .eq("id", id)
    .maybeSingle();
  if (!footer) notFound();

  const assignments = (await loadFooterAssignments(supabase)).get(footer.id) ?? [];

  return (
    <main className="admin-shell">
      <div className="mx-auto max-w-3xl">
        <Link href="/admin/footers" className="text-sm font-extrabold text-[#946332] hover:text-[#a85e32]">Back to Footers</Link>
        <article className="mt-4 rounded-2xl border border-[#284a3b]/10 bg-[#fffdf8] p-5 shadow-lg shadow-[#4d5f52]/8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#946332]">{footer.status} · {footer.language === "es" ? "Español (El Salvador)" : "English"}</p>
              <h1 className="mt-2 text-3xl font-extrabold text-[#243d31]">{footer.internal_title}</h1>
              <p className="mt-2 text-sm text-[#607066]">Updated: {new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(footer.updated_at))}</p>
            </div>
            {footer.status === "active" ? <ArchiveFooterButton action={archiveFooter.bind(null, footer.id)} /> : null}
          </div>
          <div className="mt-5 rounded-xl border border-[#284a3b]/10 bg-white p-4">
            <ContentFooter content={footer.content} />
          </div>
          <details className="mt-5" open>
            <summary className="cursor-pointer text-sm font-extrabold text-[#9d5a2f]">Edit footer</summary>
            <div className="mt-4"><FooterForm action={updateFooter.bind(null, footer.id)} internalTitle={footer.internal_title} content={footer.content} language={footer.language === "es" ? "es" : "en"} /></div>
          </details>
          <div className="mt-5 rounded-xl border border-[#284a3b]/10 bg-white/70 p-4">
            <h2 className="text-sm font-extrabold text-[#385245]">Assigned to</h2>
            {assignments.length ? <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[#607066]">{assignments.map((assignment) => <li key={assignment}>{assignment}</li>)}</ul> : <p className="mt-2 text-sm text-[#607066]">Not assigned.</p>}
          </div>
          <details className="mt-5 rounded-xl border border-[#a2472c]/20 bg-[#fff3ed] p-4">
            <summary className="cursor-pointer text-sm font-extrabold text-[#a2472c]">Delete footer</summary>
            {assignments.length ? <p className="mt-3 text-sm leading-6 text-[#754033]">This footer is assigned. Remove assignments before deleting it.</p> : null}
            <FooterDeleteForm action={deleteFooter.bind(null, footer.id)} />
          </details>
        </article>
      </div>
    </main>
  );
}
