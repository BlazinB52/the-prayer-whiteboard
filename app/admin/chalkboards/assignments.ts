import type { requireAdmin } from "@/lib/supabase/admin";

type Supabase = Awaited<ReturnType<typeof requireAdmin>>["supabase"];

/** Maps chalkboard asset id to readable assignment labels (teachings and weekly updates). */
export async function loadChalkboardAssignments(supabase: Supabase) {
  const [{ data: teachings }, { data: teachingAssignments }, { data: weeklyUpdateAssignments }] = await Promise.all([
    supabase.from("teachings").select("id, title, chalkboard_asset_id").in("status", ["draft", "published"]).order("gathering_date", { ascending: false }),
    supabase.from("teaching_chalkboard_assignments").select("chalkboard_asset_id, teachings(title, status)"),
    supabase.from("weekly_update_chalkboard_assignments").select("chalkboard_asset_id, weekly_updates(title, status, is_current)"),
  ]);

  const teachingByAsset = new Map((teachings ?? []).filter((teaching) => teaching.chalkboard_asset_id).map((teaching) => [teaching.chalkboard_asset_id as string, teaching.title]));
  const assignmentsByAsset = new Map<string, string[]>();
  for (const assignment of teachingAssignments ?? []) {
    const teaching = Array.isArray(assignment.teachings) ? assignment.teachings[0] : assignment.teachings;
    if (!teaching) continue;
    const current = assignmentsByAsset.get(assignment.chalkboard_asset_id) ?? [];
    current.push(`Teaching: ${teaching.title}`);
    assignmentsByAsset.set(assignment.chalkboard_asset_id, current);
  }
  for (const [assetId, title] of teachingByAsset) {
    if (assignmentsByAsset.has(assetId)) continue;
    assignmentsByAsset.set(assetId, [`Teaching: ${title}`]);
  }
  for (const assignment of weeklyUpdateAssignments ?? []) {
    const weeklyUpdate = Array.isArray(assignment.weekly_updates) ? assignment.weekly_updates[0] : assignment.weekly_updates;
    if (!weeklyUpdate) continue;
    const current = assignmentsByAsset.get(assignment.chalkboard_asset_id) ?? [];
    current.push(`Weekly Update: ${weeklyUpdate.title}${weeklyUpdate.is_current ? " (current)" : ""}`);
    assignmentsByAsset.set(assignment.chalkboard_asset_id, current);
  }
  return assignmentsByAsset;
}
