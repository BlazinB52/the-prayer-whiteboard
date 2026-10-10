import "server-only";

import {
  buildEmailCopyrightDisclaimer,
  canonicalCopyrightDisclaimerUrl,
  type CopyrightDisclaimerKey,
  type DisclaimerLanguage,
  FALLBACK_EMAIL_COPYRIGHT_DISCLAIMER,
  FALLBACK_EMAIL_COPYRIGHT_DISCLAIMER_ES,
} from "@/lib/copyright-disclaimer-format";
import { siteUrl } from "@/lib/email-subscriptions";
import { ESPANOL_COPYRIGHT_SHORT_FOOTER_ID } from "@/lib/espanol-constants";
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

// The Español short footer is an ordinary reusable footer managed in /admin/footers (see lib/espanol-constants.ts).
async function getSpanishShortFooterContent() {
  const supabase = createServiceRoleClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("content_footers")
    .select("content")
    .eq("id", ESPANOL_COPYRIGHT_SHORT_FOOTER_ID)
    .eq("status", "active")
    .maybeSingle();

  if (error) throw new Error(`Español copyright footer lookup failed: ${error.message}`);
  return data?.content?.trim() || null;
}

export async function getEmailCopyrightDisclaimer(baseUrl = siteUrl(), language: DisclaimerLanguage = "en") {
  if (language === "es") {
    return buildEmailCopyrightDisclaimer(
      (await getSpanishShortFooterContent()) || FALLBACK_EMAIL_COPYRIGHT_DISCLAIMER_ES,
      canonicalCopyrightDisclaimerUrl(baseUrl, "es"),
      "es",
    );
  }

  const disclaimer = await getCopyrightDisclaimer("email_short");
  return buildEmailCopyrightDisclaimer(
    disclaimer?.content?.trim() || FALLBACK_EMAIL_COPYRIGHT_DISCLAIMER,
    canonicalCopyrightDisclaimerUrl(baseUrl),
  );
}
