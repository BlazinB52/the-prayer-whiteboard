"use server";

import { redirect } from "next/navigation";
import { isStaffLinkType } from "@/lib/staff-links";
import { createClient } from "@/lib/supabase/server";

// Verifies an invite or admin-sent password-reset link and signs the person
// in, then sends them to choose a password. Runs only when the person clicks
// Continue, so email link scanners that open the URL do not use up the
// one-time token.
export async function confirmStaffLink(formData: FormData) {
  const tokenHash = String(formData.get("token_hash") ?? "").trim();
  const type = String(formData.get("type") ?? "");

  if (!tokenHash || tokenHash.length > 512 || !isStaffLinkType(type)) {
    redirect("/admin/login?error=link");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });

  if (error) {
    redirect("/admin/login?error=link");
  }

  redirect("/update-password");
}
