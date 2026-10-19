"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/supabase/admin";
import { resendConfirmationEmail, retrySubscriberSenderSync } from "@/lib/email-subscriptions";

export type SubscriberActionState = { error?: string; message?: string; needsConfirm?: boolean };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function run(formData: FormData, action: (id: string) => Promise<SubscriberActionState>): Promise<SubscriberActionState> {
  await requireAdmin();
  const id = String(formData.get("subscriberId") ?? "");
  if (!UUID_PATTERN.test(id)) return { error: "Invalid subscriber." };
  try {
    const result = await action(id);
    revalidatePath("/admin/subscribers");
    return result;
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Something went wrong." };
  }
}

// Without confirmRemovals, a sync that would take someone out of a Sender group only reports it.
export async function retrySyncAction(_previous: SubscriberActionState, formData: FormData) {
  const confirmRemovals = formData.get("confirmRemovals") === "yes";
  return run(formData, (id) => retrySubscriberSenderSync(id, confirmRemovals));
}

export async function resendConfirmationAction(_previous: SubscriberActionState, formData: FormData) {
  return run(formData, resendConfirmationEmail);
}
