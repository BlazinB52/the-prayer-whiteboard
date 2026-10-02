import type { Metadata } from "next";
import Link from "next/link";
import { InviteForm, RowActionButton } from "./forms";
import {
  inviteContentManagerAction,
  resendInviteAction,
  restoreAction,
  revokeAction,
  sendPasswordResetAction,
} from "./actions";
import { listContentManagers, type ContentManager } from "@/lib/content-managers";
import { requireAdmin } from "@/lib/supabase/admin";

export const metadata: Metadata = {
  title: "Content Managers | Prayer Whiteboard Editor",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<ContentManager["status"], { label: string; className: string }> = {
  invited: { label: "Invited", className: "bg-[#fff8e8] text-[#946332]" },
  active: { label: "Active", className: "bg-[#e7efe9] text-[#326048]" },
  revoked: { label: "Revoked", className: "bg-[#fff3ed] text-[#a2472c]" },
};

function formatDate(value: string | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Chicago" }).format(new Date(value));
}

export default async function ContentManagersPage() {
  await requireAdmin();

  let managers: ContentManager[] = [];
  let loadError = false;
  try {
    managers = await listContentManagers();
  } catch {
    loadError = true;
  }

  return (
    <main className="min-h-screen bg-[#f7f2e8] px-5 py-8 text-[#243126] sm:px-8 sm:py-12">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-col gap-5 border-b border-[#284a3b]/10 pb-8 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#946332]">Private workspace</p>
            <h1 className="mt-3 text-4xl font-extrabold tracking-tight text-[#243d31] sm:text-5xl">Content Managers</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[#607066]">
              Content managers can sign in to Content Management and edit Points of Agreement. They cannot see any other part of the editor.
            </p>
          </div>
          <Link href="/admin" className="admin-secondary-button inline-flex items-center justify-center">Back to Dashboard</Link>
        </header>

        <section className="py-10">
          <article className="rounded-2xl border border-[#284a3b]/10 bg-[#fffdf8] p-6 shadow-lg shadow-[#4d5f52]/8">
            <h2 className="text-2xl font-extrabold text-[#243d31]">Invite a content manager</h2>
            <p className="mt-2 text-sm leading-6 text-[#607066]">
              They will get an email saying they have been given access, with a link to set their own password. The link works once and expires after a short time; use Resend invite if it expires.
            </p>
            <div className="mt-5">
              <InviteForm action={inviteContentManagerAction} />
            </div>
          </article>
        </section>

        <section className="border-t border-[#284a3b]/10 py-8">
          <h2 className="text-3xl font-extrabold text-[#243d31]">Current list</h2>
          {loadError ? (
            <p role="alert" className="mt-5 rounded-xl border border-[#a2472c]/20 bg-[#fff3ed] px-4 py-3 text-sm font-bold text-[#a2472c]">Content managers could not be loaded.</p>
          ) : managers.length ? (
            <div className="mt-5 space-y-4">
              {managers.map((manager) => <ManagerCard key={manager.id} manager={manager} />)}
            </div>
          ) : (
            <p className="mt-5 rounded-2xl border border-dashed border-[#284a3b]/20 bg-[#fffdf8] p-5 text-sm leading-6 text-[#607066]">
              No content managers yet.
            </p>
          )}
        </section>
      </div>
    </main>
  );
}

function ManagerCard({ manager }: { manager: ContentManager }) {
  const status = STATUS_LABELS[manager.status];
  const detail = manager.status === "revoked"
    ? `Revoked ${formatDate(manager.revokedAt) ?? ""}`
    : manager.status === "active"
      ? `Active since ${formatDate(manager.activatedAt) ?? ""}`
      : manager.lastInviteSentAt
        ? `Invite sent ${formatDate(manager.lastInviteSentAt)}`
        : "Invite not sent yet";

  return (
    <article className="flex flex-col gap-4 rounded-2xl border border-[#284a3b]/10 bg-[#fffdf8] p-6 shadow-lg shadow-[#4d5f52]/8 lg:flex-row lg:items-start lg:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="text-xl font-extrabold text-[#243d31]">{manager.name || manager.email}</h3>
          <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wider ${status.className}`}>{status.label}</span>
        </div>
        <p className="mt-1 break-all text-sm font-bold text-[#607066]">{manager.email}</p>
        <p className="mt-1 text-xs font-bold text-[#7a877f]">{detail}</p>
      </div>
      <div className="flex flex-wrap gap-3">
        {manager.status === "invited" ? (
          <RowActionButton action={resendInviteAction.bind(null, manager.id)} label="Resend invite" pendingLabel="Sending..." />
        ) : null}
        {manager.status === "active" ? (
          <RowActionButton action={sendPasswordResetAction.bind(null, manager.id)} label="Send password reset" pendingLabel="Sending..." confirmation={`Email a password-reset link to ${manager.email}?`} />
        ) : null}
        {manager.status === "revoked" ? (
          <RowActionButton action={restoreAction.bind(null, manager.id)} label="Restore access" pendingLabel="Restoring..." confirmation={`Restore access for ${manager.name || manager.email}?`} />
        ) : (
          <RowActionButton action={revokeAction.bind(null, manager.id)} label="Revoke access" pendingLabel="Revoking..." variant="danger" confirmation={`Revoke access for ${manager.name || manager.email}? They will lose access immediately.`} />
        )}
      </div>
    </article>
  );
}
