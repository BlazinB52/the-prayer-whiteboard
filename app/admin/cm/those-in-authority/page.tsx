import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import {
  createLeader,
  deleteLeader,
  moveLeader,
  removeLeaderPhoto,
  replaceLeaderPhoto,
  updateLeader,
} from "./actions";
import { ActionButton, LeaderForm, ReplacePhotoForm } from "./forms";
import { LeaderPhoto } from "@/app/those-in-authority/leader-photo";
import { requireContentManager } from "@/lib/supabase/admin";
import {
  MAX_ACTIVE_LEADERS,
  authorityPhotoUrl,
  leaderPhotoAlt,
  type AuthorityLeader,
} from "@/lib/those-in-authority";

export const metadata: Metadata = {
  title: "Pray for Those in Authority | Content Management",
  robots: { index: false, follow: false },
};

export default async function AdminThoseInAuthorityPage({
  searchParams,
}: {
  searchParams?: Promise<{ leader?: string }>;
}) {
  const { supabase } = await requireContentManager();
  const params = await searchParams;
  const { data, error } = await supabase
    .from("authority_leaders")
    .select("id, name, title, photo_path, photo_alt, scripture_reference, scripture_text, prayer, is_active, display_order, created_at, updated_at, updated_by_name")
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });

  const leaders = error ? [] : ((data ?? []) as AuthorityLeader[]);
  const activeCount = leaders.filter((leader) => leader.is_active).length;
  const canActivate = activeCount < MAX_ACTIVE_LEADERS;

  return (
    <main className="min-h-screen bg-[#f7f2e8] px-5 py-8 text-[#243126] sm:px-8 sm:py-12">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-col gap-5 border-b border-[#284a3b]/10 pb-8 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#946332]">Private workspace</p>
            <h1 className="mt-3 text-4xl font-extrabold tracking-tight text-[#243d31] sm:text-5xl">Pray for Those in Authority</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[#607066]">
              Manage the leaders on the prayer list. Only active leaders appear on the public page, in the order shown below.
            </p>
            <p className="mt-3 inline-flex rounded-full bg-[#e7efe9] px-3 py-1 text-xs font-black uppercase tracking-wider text-[#326048]">
              Active: {activeCount} of {MAX_ACTIVE_LEADERS}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <a
              href="/those-in-authority"
              target="_blank"
              rel="noopener"
              className="admin-primary-button inline-flex items-center justify-center gap-2"
            >
              Preview public page <ExternalLink aria-hidden="true" size={16} />
            </a>
            <Link href="/admin/cm" className="admin-secondary-button inline-flex items-center justify-center">Back to Content Management</Link>
          </div>
        </header>

        {params?.leader ? (
          <p role="status" className="mt-6 rounded-xl border border-[#326048]/15 bg-[#e7efe9] px-4 py-3 text-sm font-bold text-[#326048]">
            {statusMessage(params.leader)}
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="mt-6 rounded-xl border border-[#a2472c]/20 bg-[#fff3ed] px-4 py-3 text-sm font-bold text-[#a2472c]">
            Leaders could not be loaded.
          </p>
        ) : null}

        <section className="border-b border-[#284a3b]/10 py-8">
          <article className="rounded-2xl border border-[#284a3b]/10 bg-[#fffdf8] p-6 shadow-lg shadow-[#4d5f52]/8">
            <h2 className="text-2xl font-extrabold text-[#243d31]">Add a leader</h2>
            <div className="mt-5 max-w-3xl">
              <LeaderForm action={createLeader} canActivate={canActivate} />
            </div>
          </article>
        </section>

        <section className="py-8">
          <h2 className="text-3xl font-extrabold text-[#243d31]">Prayer list</h2>
          {leaders.length ? (
            <div className="mt-5 space-y-5">
              {leaders.map((leader, index) => (
                <LeaderCard
                  key={leader.id}
                  leader={leader}
                  canActivate={canActivate}
                  canMoveUp={index > 0}
                  canMoveDown={index < leaders.length - 1}
                />
              ))}
            </div>
          ) : (
            <p className="mt-5 rounded-2xl border border-dashed border-[#284a3b]/20 bg-[#fffdf8] p-5 text-sm leading-6 text-[#607066]">
              No leaders yet. Add one above.
            </p>
          )}
        </section>
      </div>
    </main>
  );
}

function LeaderCard({
  leader,
  canActivate,
  canMoveUp,
  canMoveDown,
}: {
  leader: AuthorityLeader;
  canActivate: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
}) {
  const photoUrl = authorityPhotoUrl(leader.photo_path);

  return (
    <article className="rounded-2xl border border-[#284a3b]/10 bg-[#fffdf8] p-6 shadow-lg shadow-[#4d5f52]/8">
      <div className="flex flex-col gap-3 border-b border-[#284a3b]/10 pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className={`text-xs font-extrabold uppercase tracking-[0.18em] ${leader.is_active ? "text-[#326048]" : "text-[#946332]"}`}>
            {leader.is_active ? "Active" : "Not active"}
          </p>
          <h3 className="mt-2 text-2xl font-extrabold text-[#243d31]">{leader.name}</h3>
          <p className="text-sm font-bold text-[#607066]">{leader.title}</p>
          {leader.updated_by_name ? <LastEdited name={leader.updated_by_name} at={leader.updated_at} /> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <ActionButton action={moveLeader.bind(null, leader.id, "up")} label="Move up" pendingLabel="Moving..." disabled={!canMoveUp} />
          <ActionButton action={moveLeader.bind(null, leader.id, "down")} label="Move down" pendingLabel="Moving..." disabled={!canMoveDown} />
          <ActionButton
            action={deleteLeader.bind(null, leader.id)}
            label="Delete"
            pendingLabel="Deleting..."
            variant="danger"
            confirmation={`Permanently delete ${leader.name}, including the photo, scripture, and prayer?`}
          />
        </div>
      </div>

      <div className="mt-5 grid gap-6 md:grid-cols-[13rem_minmax(0,1fr)]">
        <div className="space-y-3">
          <LeaderPhoto src={photoUrl} alt={leaderPhotoAlt(leader)} className="mx-auto max-w-[13rem]" />
          <ReplacePhotoForm action={replaceLeaderPhoto.bind(null, leader.id)} hasPhoto={Boolean(photoUrl)} />
          {photoUrl ? (
            <ActionButton
              action={removeLeaderPhoto.bind(null, leader.id)}
              label="Remove photo"
              pendingLabel="Removing..."
              variant="danger"
              confirmation="Remove this photo? The rest of the entry stays, and the page will show “No photo available.”"
            />
          ) : null}
        </div>
        <LeaderForm leader={leader} action={updateLeader.bind(null, leader.id)} canActivate={leader.is_active || canActivate} />
      </div>
    </article>
  );
}

function LastEdited({ name, at }: { name: string; at: string }) {
  const when = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Chicago" }).format(new Date(at));
  return <p className="mt-1 text-xs font-bold text-[#7a877f]">Last edited by {name} &middot; {when}</p>;
}

function statusMessage(value: string) {
  const messages: Record<string, string> = {
    created: "Leader added.",
    "created-inactive": `Leader added to the pool as not active, because ${MAX_ACTIVE_LEADERS} leaders are already active.`,
    deleted: "Leader deleted.",
    "photo-removed": "Photo removed.",
    "moved-up": "Leader moved up.",
    "moved-down": "Leader moved down.",
  };
  return messages[value] ?? "Prayer list updated.";
}
