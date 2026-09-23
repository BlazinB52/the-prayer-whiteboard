import "server-only";

import type { sendSenderTransactionalEmail } from "@/lib/sender-transactional";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

// Sender rejects addresses it has suppressed (prior bounce, spam complaint, or
// an unsubscribe click on any single send). Retrying those never succeeds, so
// every send path — confirmation, management, and each broadcast — parks the
// subscriber in 'suppressed' the first time it sees this rejection, instead of
// silently failing the same way on every future attempt.
export function isSuppressionRejection(result: Awaited<ReturnType<typeof sendSenderTransactionalEmail>>) {
  if (result.ok || result.reason !== "rejected") return false;
  return /suppression list/i.test(result.rejection?.errorMessage ?? result.message);
}

export async function markSubscriberSuppressed(subscriberId: string) {
  const supabase = createServiceRoleClient();
  if (!supabase) throw new Error("Subscriber storage is not configured.");
  await supabase.from("email_subscribers").update({
    status: "suppressed",
    suppressed_at: new Date().toISOString(),
  }).eq("id", subscriberId);
}
