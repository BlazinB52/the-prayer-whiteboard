import "server-only";

import { loadConfirmedRecipients } from "@/lib/broadcast-recipients";

type LedgerClient = {
  from: (table: string) => {
    select: (columns: string) => PromiseLike<{ data: { weekly_update_id: string }[] | null; error: unknown }>;
  };
};

/** Looks up what publishing would email: which updates were already emailed, and how many would receive one. */
export async function getWeeklyUpdateEmailLookup(supabase: unknown): Promise<{ sentIds: Set<string>; recipientCount: number | null }> {
  const { data } = await (supabase as LedgerClient).from("email_broadcast_events").select("weekly_update_id");
  const sentIds = new Set((data ?? []).map((row) => row.weekly_update_id));

  // The same list the broadcast itself reads, so the number shown is the number emailed.
  let recipientCount: number | null = null;
  try {
    recipientCount = (await loadConfirmedRecipients("weekly_updates", "en")).length;
  } catch {
    recipientCount = null;
  }
  return { sentIds, recipientCount };
}
