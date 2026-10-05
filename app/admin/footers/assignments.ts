import type { requireAdmin } from "@/lib/supabase/admin";

type Supabase = Awaited<ReturnType<typeof requireAdmin>>["supabase"];

/** Maps footer id to readable assignment labels (teachings and weekly updates). */
export async function loadFooterAssignments(supabase: Supabase) {
  const [{ data: teachingAssignments }, { data: weeklyUpdateAssignments }] = await Promise.all([
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
  return assignmentsByFooter;
}
