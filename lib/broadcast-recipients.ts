import "server-only";

import type { EmailCategory } from "@/lib/email-categories";
import { normalizeLanguages } from "@/lib/subscriber-languages";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

const PAGE_SIZE = 100;

export type BroadcastRecipient = { id: string; firstName: string; email: string };

// Recipients come from Supabase rather than a Sender group, so the double
// opt-in state in our own database decides who is mailed.
// Language defaults to English so every existing broadcast keeps mailing only English subscribers;
// an Español subscriber receives only a send that asks for "es" explicitly.
export async function loadConfirmedRecipients(category: EmailCategory, language: "en" | "es" = "en"): Promise<BroadcastRecipient[]> {
  const supabase = createServiceRoleClient();
  if (!supabase) throw new Error("Broadcast storage is not configured.");

  const recipients: BroadcastRecipient[] = [];
  for (let page = 0; ; page += 1) {
    const from = page * PAGE_SIZE;
    const { data, error } = await supabase
      .from("email_subscription_preferences")
      .select("subscriber_id, email_subscribers!inner(id, first_name, email, status, languages)")
      .eq("category", category)
      .eq("status", "active")
      .eq("email_subscribers.status", "confirmed")
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`Recipient lookup failed: ${error.message}`);
    if (!data?.length) break;

    for (const row of data as unknown as { email_subscribers: { id: string; first_name: string; email: string; languages: string[] | null } }[]) {
      const subscriber = row.email_subscribers;
      // Only subscribers who chose this language are mailed. An English send never reaches someone who
      // chose Español only, and the other way round; someone who chose both gets both.
      if (subscriber?.email && normalizeLanguages(subscriber.languages).includes(language)) {
        recipients.push({ id: subscriber.id, firstName: subscriber.first_name, email: subscriber.email });
      }
    }

    if (data.length < PAGE_SIZE) break;
  }
  return recipients;
}
