"use server";

import { revalidatePath } from "next/cache";
import {
  inviteContentManager,
  resendContentManagerInvite,
  restoreContentManager,
  revokeContentManager,
  sendContentManagerPasswordReset,
  type ContentManagerResult,
} from "@/lib/content-managers";
import { normalizeStaffEmail, normalizeStaffName } from "@/lib/staff-roles";
import { requireAdmin } from "@/lib/supabase/admin";

export type ContentManagerActionState = { error?: string; message?: string };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function toState(result: ContentManagerResult): ContentManagerActionState {
  revalidatePath("/admin/content-managers");
  return result.ok ? { message: result.message } : { error: result.error };
}

export async function inviteContentManagerAction(_: ContentManagerActionState, formData: FormData): Promise<ContentManagerActionState> {
  const { user } = await requireAdmin();
  const name = normalizeStaffName(String(formData.get("name") ?? ""));
  const email = normalizeStaffEmail(String(formData.get("email") ?? ""));
  if (!name) return { error: "Enter a name (up to 120 characters)." };
  if (!email) return { error: "Enter a valid email address." };
  return toState(await inviteContentManager({ name, email, grantedBy: user.id }));
}

type RowAction = (id: string) => Promise<ContentManagerResult>;

async function runRowAction(id: string, action: RowAction): Promise<ContentManagerActionState> {
  await requireAdmin();
  if (!UUID_PATTERN.test(id)) return { error: "That content manager could not be found." };
  return toState(await action(id));
}

export async function resendInviteAction(id: string, previousState: ContentManagerActionState): Promise<ContentManagerActionState> {
  void previousState;
  return runRowAction(id, resendContentManagerInvite);
}

export async function sendPasswordResetAction(id: string, previousState: ContentManagerActionState): Promise<ContentManagerActionState> {
  void previousState;
  return runRowAction(id, sendContentManagerPasswordReset);
}

export async function revokeAction(id: string, previousState: ContentManagerActionState): Promise<ContentManagerActionState> {
  void previousState;
  return runRowAction(id, revokeContentManager);
}

export async function restoreAction(id: string, previousState: ContentManagerActionState): Promise<ContentManagerActionState> {
  void previousState;
  return runRowAction(id, restoreContentManager);
}
