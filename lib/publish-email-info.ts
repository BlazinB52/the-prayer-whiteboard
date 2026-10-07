import "server-only";

import { loadConfirmedRecipients } from "@/lib/broadcast-recipients";
import type { PublishEmailInfo } from "@/lib/publish-email-notice";

type AdminSupabase = {
  from: (table: string) => {
    select: (columns: string, options?: { count: "exact"; head: true }) => {
      eq: (column: string, value: string) => PromiseLike<{ count: number | null; error: unknown }>;
    };
  };
};

/** Looks up what publishing this teaching would email, so the Administrator can see it first. */
export async function getPublishEmailInfo(supabase: unknown, teachingId: string, language: "en" | "es"): Promise<PublishEmailInfo> {
  if (language === "es") return { language, alreadySent: false, recipientCount: 0 };

  const { count } = await (supabase as AdminSupabase)
    .from("email_teaching_broadcast_events")
    .select("id", { count: "exact", head: true })
    .eq("teaching_id", teachingId);
  const alreadySent = (count ?? 0) > 0;
  if (alreadySent) return { language, alreadySent, recipientCount: null };

  // The same list the broadcast itself reads, so the number shown is the number emailed.
  let recipientCount: number | null = null;
  try {
    recipientCount = (await loadConfirmedRecipients("teachings", "en")).length;
  } catch {
    recipientCount = null;
  }
  return { language, alreadySent, recipientCount };
}
