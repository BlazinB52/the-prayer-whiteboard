import "server-only";

import { siteUrl } from "@/lib/email-subscriptions";
import { buildReviewReadyEmail, reviewPath, type ReviewKind } from "@/lib/review-ready-email";
import { sendSenderTransactionalEmail } from "@/lib/sender-transactional";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export type ReviewNotifyResult = { recipients: number; sent: number; failed: number };

/**
 * Emails every active Content Manager that something is ready for their review. One email each, sent one at
 * a time. A failure for one person never stops the others, and the result says how many it reached so the
 * Administrator can tell them directly if an email did not go.
 */
export async function notifyContentManagers(input: { kind: ReviewKind; id: string; title: string; senderName?: string | null }): Promise<ReviewNotifyResult> {
  const supabase = createServiceRoleClient();
  if (!supabase) return { recipients: 0, sent: 0, failed: 0 };

  const { data: managers } = await supabase
    .from("admin_authorizations")
    .select("user_id, email, display_name")
    .eq("role", "content_manager")
    .eq("is_active", true)
    .is("revoked_at", null);

  const reviewUrl = `${siteUrl()}${reviewPath(input.kind, input.id)}`;
  let sent = 0;
  let failed = 0;
  let recipients = 0;

  for (const manager of managers ?? []) {
    let email = typeof manager.email === "string" ? manager.email.trim() : "";
    if (!email && manager.user_id) {
      const { data } = await supabase.auth.admin.getUserById(manager.user_id);
      email = data.user?.email?.trim() ?? "";
    }
    if (!email) continue;
    recipients += 1;

    const content = buildReviewReadyEmail({ kind: input.kind, title: input.title, reviewUrl, recipientName: manager.display_name, senderName: input.senderName });
    const result = await sendSenderTransactionalEmail({ toEmail: email, toName: manager.display_name ?? undefined, subject: content.subject, html: content.html, text: content.text });
    if (result.ok) sent += 1;
    else failed += 1;
  }

  return { recipients, sent, failed };
}
