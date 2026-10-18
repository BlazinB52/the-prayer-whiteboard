import Link from "next/link";
import { assignExistingDevotional, removeDevotionalAssignment } from "@/app/admin/devotionals/actions";
import { devotionalChoices } from "@/lib/devotional-choices";
import { requireAdmin } from "@/lib/supabase/admin";
import { DevotionalAssignmentForm } from "./devotional-assignment-form";

// The "7-Day Devotional" box on a teaching's edit page. Attaching a devotional is optional: the box shows the one attached
// (if any) and lets the Administrator pick another from the devotionals that already exist. Devotionals themselves are
// created and edited under Devotionals.
export async function TeachingDevotionalCard({ teachingId, language, notice }: { teachingId: string; language: "en" | "es"; notice?: string }) {
  const { supabase } = await requireAdmin();
  const [{ data: assignment }, { data: devotionals }, { data: allAssignments }] = await Promise.all([
    supabase.from("teaching_devotional_assignments").select("devotional_id").eq("teaching_id", teachingId).maybeSingle(),
    supabase.from("teaching_devotionals").select("id, teaching_id, title, status, language, gathering_date").order("title", { ascending: true }),
    supabase.from("teaching_devotional_assignments").select("devotional_id, teaching_id"),
  ]);
  const datedTeachingIds = [...new Set([...(allAssignments ?? []).map((row) => row.teaching_id as string), ...(devotionals ?? []).map((item) => item.teaching_id as string | null).filter((value): value is string => Boolean(value))])];
  const { data: teachingDates } = datedTeachingIds.length ? await supabase.from("teachings").select("id, gathering_date").in("id", datedTeachingIds) : { data: [] };
  const current = (devotionals ?? []).find((item) => item.id === assignment?.devotional_id) ?? null;

  return (
    <section id="devotional" className="mt-8 rounded-2xl border border-[#284a3b]/10 bg-[#fffdf8] p-5">
      <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#946332]">Devotional</p>
      <h2 className="mt-2 text-2xl font-extrabold text-[#243d31]">7-Day Devotional</h2>
      {notice === "attached" ? <p role="status" className="mt-3 rounded-xl border border-[#326048]/20 bg-[#e7efe9] px-4 py-3 text-sm font-bold text-[#326048]">The devotional is attached to this teaching.</p> : null}
      {notice === "removed" ? <p role="status" className="mt-3 rounded-xl border border-[#326048]/20 bg-[#e7efe9] px-4 py-3 text-sm font-bold text-[#326048]">The devotional was removed from this teaching. The devotional itself was not deleted.</p> : null}
      {current ? (
        <p className="mt-3 text-sm text-[#607066]">
          Attached devotional: <Link href={`/admin/devotionals/${current.id}`} className="font-extrabold text-[#243d31] underline underline-offset-2">{current.title}</Link>{" "}
          <span className="ml-1 rounded-full bg-[#e7efe9] px-3 py-1 text-[10px] font-black uppercase tracking-wider text-[#326048]">{current.status}</span>
        </p>
      ) : (
        <p className="mt-3 text-sm text-[#607066]">No devotional is attached to this teaching. Attaching one is optional.</p>
      )}
      <DevotionalAssignmentForm
        devotionals={devotionalChoices({
          devotionals: (devotionals ?? []).map((item) => ({ id: item.id, title: item.title, status: item.status, language: item.language, legacyTeachingId: item.teaching_id ?? null, gatheringDate: item.gathering_date ?? null })),
          assignments: (allAssignments ?? []) as { devotional_id: string; teaching_id: string }[],
          teachingDates: (teachingDates ?? []) as { id: string; gathering_date: string | null }[],
          teachingLanguage: language,
          currentDevotionalId: current?.id ?? null,
        })}
        currentDevotionalId={current?.id ?? null}
        assignAction={assignExistingDevotional.bind(null, teachingId)}
        removeAction={removeDevotionalAssignment.bind(null, teachingId)}
      />
      <p className="mt-4 text-sm leading-6 text-[#607066]">
        To write a new one, use <Link href="/admin/devotionals/new" className="font-extrabold text-[#9d5a2f] hover:underline">Create New Devotional</Link>, then come back and attach it here. Attaching does not change this teaching&apos;s publication or homepage-feature status.
      </p>
    </section>
  );
}
