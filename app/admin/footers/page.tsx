import type { Metadata } from "next";
import Link from "next/link";
import { archiveFooter, createFooter, deleteFooter, updateFooter } from "./actions";
import { ArchiveFooterButton } from "./archive-button";
import { FooterDeleteForm, FooterForm } from "./footer-form";
import { ContentFooter } from "@/app/content-footer";
import { requireAdmin } from "@/lib/supabase/admin";

export const metadata: Metadata = {
  title: "Reusable Footers",
  robots: { index: false, follow: false },
};

export default async function AdminFootersPage() {
  const { supabase } = await requireAdmin();
  const [{ data: footers, error }, { data: teachingAssignments }, { data: weeklyUpdateAssignments }] = await Promise.all([
    supabase.from("content_footers").select("id, internal_title, content, status, updated_at").order("status", { ascending: true }).order("internal_title", { ascending: true }),
    supabase.from("teaching_footer_assignments").select("footer_id, teachings(title, status)"),
    supabase.from("weekly_update_footer_assignments").select("footer_id, weekly_updates(title, status, is_current)"),
  ]);

  const assignmentsByFooter = new Map<string, string[]>();
  for (const assignment of teachingAssignments ?? []) {
    const teaching = Array.isArray(assignment.teachings) ? assignment.teachings[0] : assignment.teachings;
    if (!teaching) continue;
    const current = assignmentsByFooter.get(assignment.footer_id) ?? [];
    current.push(`Teaching: ${teaching.title} (${teaching.status})`);
    assignmentsByFooter.set(assignment.footer_id, current);
  }
  for (const assignment of weeklyUpdateAssignments ?? []) {
    const weeklyUpdate = Array.isArray(assignment.weekly_updates) ? assignment.weekly_updates[0] : assignment.weekly_updates;
    if (!weeklyUpdate) continue;
    const current = assignmentsByFooter.get(assignment.footer_id) ?? [];
    current.push(`Weekly Update: ${weeklyUpdate.title}${weeklyUpdate.is_current ? " (current)" : ` (${weeklyUpdate.status})`}`);
    assignmentsByFooter.set(assignment.footer_id, current);
  }

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
          <h2 className="text-2xl font-extrabold text-[#243d31]">Footer library</h2>
          {error ? <p className="mt-4 text-sm font-bold text-[#a2472c]">Footers could not be loaded.</p> : null}
          {footers?.length ? (
            <div className="mt-5 grid gap-5">
              {footers.map((footer) => {
                const assignments = assignmentsByFooter.get(footer.id) ?? [];
                return (
                  <article key={footer.id} className="rounded-2xl border border-[#284a3b]/10 bg-[#fffdf8] p-5 shadow-lg shadow-[#4d5f52]/8">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#946332]">{footer.status}</p>
                        <h3 className="mt-2 text-2xl font-extrabold text-[#243d31]">{footer.internal_title}</h3>
                        <p className="mt-2 text-sm text-[#607066]">Updated: {new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(footer.updated_at))}</p>
                      </div>
                      {footer.status === "active" ? <ArchiveFooterButton action={archiveFooter.bind(null, footer.id)} /> : null}
                    </div>
                    <div className="mt-5 rounded-xl border border-[#284a3b]/10 bg-white p-4">
                      <ContentFooter content={footer.content} />
                    </div>
                    <details className="mt-5">
                      <summary className="cursor-pointer text-sm font-extrabold text-[#9d5a2f]">Edit footer</summary>
                      <div className="mt-4"><FooterForm action={updateFooter.bind(null, footer.id)} internalTitle={footer.internal_title} content={footer.content} /></div>
                    </details>
                    <div className="mt-5 rounded-xl border border-[#284a3b]/10 bg-white/70 p-4">
                      <h4 className="text-sm font-extrabold text-[#385245]">Assigned to</h4>
                      {assignments.length ? <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[#607066]">{assignments.map((assignment) => <li key={assignment}>{assignment}</li>)}</ul> : <p className="mt-2 text-sm text-[#607066]">Not assigned.</p>}
                    </div>
                    <details className="mt-5 rounded-xl border border-[#a2472c]/20 bg-[#fff3ed] p-4">
                      <summary className="cursor-pointer text-sm font-extrabold text-[#a2472c]">Delete footer</summary>
                      {assignments.length ? <p className="mt-3 text-sm leading-6 text-[#754033]">This footer is assigned. Remove assignments before deleting it.</p> : null}
                      <FooterDeleteForm action={deleteFooter.bind(null, footer.id)} />
                    </details>
                  </article>
                );
              })}
            </div>
          ) : <p className="mt-4 text-sm text-[#607066]">No footers have been created yet.</p>}
        </section>
      </div>
    </main>
  );
}
