import type { Metadata } from "next";
import Link from "next/link";
import {
  archivePointOfAgreement,
  createPointOfAgreement,
  deletePointOfAgreement,
  movePointOfAgreement,
  restorePointOfAgreement,
  updateGuideSettings,
  updatePointOfAgreement,
} from "./actions";
import {
  ConfirmActionButton,
  DeletePointForm,
  GuideSettingsForm,
  PointOfAgreementForm,
} from "./forms";
import {
  DEFAULT_POINTS_OF_AGREEMENT_GUIDE_SETTINGS,
  formatGuideDate,
  getExpirationState,
  type PointOfAgreement,
  type PointsOfAgreementGuideSettings,
} from "@/lib/points-of-agreement";
import { requireAdmin } from "@/lib/supabase/admin";

export const metadata: Metadata = {
  title: "Points of Agreement | Prayer Whiteboard Editor",
  robots: { index: false, follow: false },
};

export default async function AdminPointsOfAgreementPage({
  searchParams,
}: {
  searchParams?: Promise<{ point?: string }>;
}) {
  const { supabase } = await requireAdmin();
  const params = await searchParams;
  const [{ data: settings, error: settingsError }, { data: points, error: pointsError }] = await Promise.all([
    supabase
      .from("points_of_agreement_guide_settings")
      .select("title, subtitle, opening_scripture, opening_scripture_reference, footer_quotation, footer_scripture_reference")
      .eq("id", true)
      .maybeSingle(),
    supabase
      .from("points_of_agreement")
      .select("id, point_of_agreement, scripture, target, decree, additional_direction, expires_on, display_order, status, created_at, updated_at, archived_at")
      .order("status", { ascending: true })
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: true })
      .order("id", { ascending: true }),
  ]);
  const guideSettings = settingsError || !settings
    ? DEFAULT_POINTS_OF_AGREEMENT_GUIDE_SETTINGS
    : settings as PointsOfAgreementGuideSettings;
  const guidePoints = pointsError ? [] : (points ?? []) as PointOfAgreement[];
  const activeAlerts = guidePoints
    .filter((point) => point.status === "active")
    .map((point) => ({ point, expirationState: getExpirationState(point.expires_on) }))
    .filter(({ expirationState }) => expirationState !== "current");
  const activePoints = guidePoints.filter((point) => point.status === "active");
  const archivedPoints = guidePoints.filter((point) => point.status === "archived");

  return (
    <main className="min-h-screen bg-[#f7f2e8] px-5 py-8 text-[#243126] sm:px-8 sm:py-12">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-col gap-5 border-b border-[#284a3b]/10 pb-8 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#946332]">Private workspace</p>
            <h1 className="mt-3 text-4xl font-extrabold tracking-tight text-[#243d31] sm:text-5xl">Points of Agreement</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[#607066]">
              Manage the Prayer & Intercession Guide. Expired active points remain public until you archive or delete them.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/points-of-agreement" className="admin-secondary-button inline-flex items-center justify-center">View Public Guide</Link>
            <Link href="/admin" className="admin-secondary-button inline-flex items-center justify-center">Back to Dashboard</Link>
          </div>
        </header>

        {params?.point ? <p role="status" className="mt-6 rounded-xl border border-[#326048]/15 bg-[#e7efe9] px-4 py-3 text-sm font-bold text-[#326048]">{pointStatusMessage(params.point)}</p> : null}
        {settingsError ? <p role="alert" className="mt-6 rounded-xl border border-[#a2472c]/20 bg-[#fff3ed] px-4 py-3 text-sm font-bold text-[#a2472c]">Guide settings could not be loaded. Default text is shown.</p> : null}
        {pointsError ? <p role="alert" className="mt-6 rounded-xl border border-[#a2472c]/20 bg-[#fff3ed] px-4 py-3 text-sm font-bold text-[#a2472c]">Points could not be loaded.</p> : null}

        <section className="grid gap-6 py-10 lg:grid-cols-[0.92fr_1.08fr]">
          <article className="rounded-2xl border border-[#284a3b]/10 bg-[#fffdf8] p-6 shadow-lg shadow-[#4d5f52]/8">
            <h2 className="text-2xl font-extrabold text-[#243d31]">Guide header and footer</h2>
            <div className="mt-5">
              <GuideSettingsForm settings={guideSettings} action={updateGuideSettings} />
            </div>
          </article>

          <article className="rounded-2xl border border-[#284a3b]/10 bg-[#fffdf8] p-6 shadow-lg shadow-[#4d5f52]/8">
            <h2 className="text-2xl font-extrabold text-[#243d31]">Create point</h2>
            <div className="mt-5">
              <PointOfAgreementForm action={createPointOfAgreement} />
            </div>
          </article>
        </section>

        <section className="border-t border-[#284a3b]/10 py-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#946332]">Expiration review</p>
              <h2 className="mt-2 text-3xl font-extrabold text-[#243d31]">Expiring and expired points</h2>
            </div>
            <p className="text-sm font-bold text-[#607066]">{activeAlerts.length} need attention</p>
          </div>
          {activeAlerts.length ? (
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {activeAlerts.map(({ point, expirationState }) => (
                <article key={point.id} className="rounded-2xl border border-[#d2a34f]/25 bg-[#fff8e8] p-4">
                  <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#946332]">
                    {expirationState === "expired" ? "Expired" : "Expiring soon"}: {formatGuideDate(point.expires_on)}
                  </p>
                  <p className="mt-2 font-extrabold text-[#263f33]">{point.point_of_agreement}</p>
                </article>
              ))}
            </div>
          ) : (
            <p className="mt-5 rounded-2xl border border-dashed border-[#284a3b]/20 bg-[#fffdf8] p-5 text-sm leading-6 text-[#607066]">
              No active points expire within the next 7 days.
            </p>
          )}
        </section>

        <PointList title="Active points" points={activePoints} enableMoveControls />
        <PointList title="Archived points" points={archivedPoints} />
      </div>
    </main>
  );
}

function PointList({ title, points, enableMoveControls = false }: { title: string; points: PointOfAgreement[]; enableMoveControls?: boolean }) {
  return (
    <section className="border-t border-[#284a3b]/10 py-8">
      <h2 className="text-3xl font-extrabold text-[#243d31]">{title}</h2>
      {points.length ? (
        <div className="mt-5 space-y-5">
          {points.map((point, index) => (
            <PointCard
              key={point.id}
              point={point}
              canMoveUp={enableMoveControls && index > 0}
              canMoveDown={enableMoveControls && index < points.length - 1}
            />
          ))}
        </div>
      ) : (
        <p className="mt-5 rounded-2xl border border-dashed border-[#284a3b]/20 bg-[#fffdf8] p-5 text-sm leading-6 text-[#607066]">
          No {title.toLowerCase()} yet.
        </p>
      )}
    </section>
  );
}

function PointCard({ point, canMoveUp = false, canMoveDown = false }: { point: PointOfAgreement; canMoveUp?: boolean; canMoveDown?: boolean }) {
  const expirationState = getExpirationState(point.expires_on);
  const updateAction = updatePointOfAgreement.bind(null, point.id);
  const archiveAction = archivePointOfAgreement.bind(null, point.id);
  const restoreAction = restorePointOfAgreement.bind(null, point.id);
  const deleteAction = deletePointOfAgreement.bind(null, point.id);
  const moveUpAction = movePointOfAgreement.bind(null, point.id, "up");
  const moveDownAction = movePointOfAgreement.bind(null, point.id, "down");

  return (
    <article className="rounded-2xl border border-[#284a3b]/10 bg-[#fffdf8] p-6 shadow-lg shadow-[#4d5f52]/8">
      <div className="flex flex-col gap-3 border-b border-[#284a3b]/10 pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#946332]">Order {point.display_order} &middot; {point.status}</p>
          <h3 className="mt-2 text-2xl font-extrabold text-[#243d31]">{point.point_of_agreement}</h3>
          <p className="mt-2 text-sm font-bold text-[#607066]">
            Expires {formatGuideDate(point.expires_on)}
            {expirationState === "expired" ? " - expired" : expirationState === "expiring-soon" ? " - expiring soon" : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {point.status === "active" ? (
            <>
              <ConfirmActionButton action={moveUpAction} label="Move up" pendingLabel="Moving..." disabled={!canMoveUp} />
              <ConfirmActionButton action={moveDownAction} label="Move down" pendingLabel="Moving..." disabled={!canMoveDown} />
              <ConfirmActionButton action={archiveAction} label="Archive" pendingLabel="Archiving..." confirmation="Archive this point?" />
            </>
          ) : (
            <ConfirmActionButton action={restoreAction} label="Restore" pendingLabel="Restoring..." confirmation="Restore this point to active?" />
          )}
          <DeletePointForm action={deleteAction} />
        </div>
      </div>
      <div className="mt-5">
        <PointOfAgreementForm point={point} action={updateAction} />
      </div>
    </article>
  );
}

function pointStatusMessage(value: string) {
  const messages: Record<string, string> = {
    created: "Point created.",
    archived: "Point archived.",
    restored: "Point restored.",
    deleted: "Point deleted.",
    "moved-up": "Point moved up.",
    "moved-down": "Point moved down.",
  };
  return messages[value] ?? "Point updated.";
}
