import { redirect } from "next/navigation";
import { createClient } from "./server";

type ReviewerAccount = {
  id: string;
  auth_user_id: string;
  login_name: string;
  display_name: string;
  role: "reviewer";
  status: "pending" | "active" | "disabled";
  must_change_password: boolean;
  first_login_completed_at: string | null;
  temporary_password_expires_at: string | null;
};

export async function requireReviewer() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/review/login");
  }

  const { data: isReviewer, error } = await supabase.rpc(
    "is_authenticated_reviewer",
  );

  if (error || !isReviewer) {
    const { data: needsPasswordChange } = await supabase.rpc(
      "is_pending_reviewer_password_change",
    );

    if (needsPasswordChange) {
      redirect("/review/change-password");
    }

    redirect("/review/login?error=invalid");
  }

  const { data: reviewer } = await supabase
    .from("reviewer_accounts")
    .select("id, auth_user_id, login_name, display_name, role, status, must_change_password, first_login_completed_at, temporary_password_expires_at")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!reviewer) {
    redirect("/review/login?error=invalid");
  }

  return { supabase, user, reviewer: reviewer as ReviewerAccount };
}

export async function requirePendingReviewerPasswordChange() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/review/login");
  }

  const { data: isReviewer } = await supabase.rpc(
    "is_authenticated_reviewer",
  );

  if (isReviewer) {
    redirect("/review");
  }

  const { data: canChangePassword, error } = await supabase.rpc(
    "is_pending_reviewer_password_change",
  );

  if (error || !canChangePassword) {
    redirect("/review/login?error=temp-expired");
  }

  const { data: reviewer } = await supabase
    .from("reviewer_accounts")
    .select("id, auth_user_id, login_name, display_name, role, status, must_change_password, first_login_completed_at, temporary_password_expires_at")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!reviewer) {
    redirect("/review/login?error=invalid");
  }

  return { supabase, user, reviewer: reviewer as ReviewerAccount };
}

export async function getAuthorizedReviewer() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data: isReviewer, error } = await supabase.rpc(
    "is_authenticated_reviewer",
  );

  if (error || !isReviewer) {
    return null;
  }

  const { data: reviewer } = await supabase
    .from("reviewer_accounts")
    .select("id, auth_user_id, login_name, display_name, role, status, must_change_password, first_login_completed_at, temporary_password_expires_at")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  return reviewer ? { supabase, user, reviewer: reviewer as ReviewerAccount } : null;
}
