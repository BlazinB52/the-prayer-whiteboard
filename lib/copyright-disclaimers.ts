import "server-only";

import {
  buildEmailCopyrightDisclaimer,
  canonicalCopyrightDisclaimerUrl,
  type CopyrightDisclaimerKey,
  FALLBACK_EMAIL_COPYRIGHT_DISCLAIMER,
} from "@/lib/copyright-disclaimer-format";
import { siteUrl } from "@/lib/email-subscriptions";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export async function getCopyrightDisclaimer(disclaimerKey: CopyrightDisclaimerKey) {
  const supabase = createServiceRoleClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("copyright_disclaimers")
    .select("disclaimer_key, title, content, updated_at")
    .eq("disclaimer_key", disclaimerKey)
    .maybeSingle();

  if (error) throw new Error(`Copyright disclaimer lookup failed: ${error.message}`);
  return data;
}

export async function getEmailCopyrightDisclaimer(baseUrl = siteUrl()) {
  const disclaimer = await getCopyrightDisclaimer("email_short");
  return buildEmailCopyrightDisclaimer(
    disclaimer?.content?.trim() || FALLBACK_EMAIL_COPYRIGHT_DISCLAIMER,
    canonicalCopyrightDisclaimerUrl(baseUrl),
  );
}
