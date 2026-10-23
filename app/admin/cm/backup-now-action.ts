"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/supabase/admin";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export type BackupNowState = { error?: string; requested?: boolean };

// Leaves a request for the backup program on the administrator's computer; it does not run the backup itself. See
// supabase/migrations/20261022000000_backup_requests.sql.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function requestBackupNow(_previous: BackupNowState): Promise<BackupNowState> {
  const { user } = await requireAdmin();
  const client = createServiceRoleClient();
  if (!client) return { error: "The backup could not be requested. Try again in a moment." };

  const { error } = await client.from("backup_requests").insert({ requested_by: user.id });
  // 23505: the one-active-request index. A backup is already waiting or running, which is what was asked for.
  if (error && error.code !== "23505") return { error: "The backup could not be requested. Try again in a moment." };

  revalidatePath("/admin/cm");
  return { requested: true };
}
