import { redirect } from "next/navigation";
import { createClient } from "./server";

export async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/admin/login");
  }

  const { data: isAdmin, error } = await supabase.rpc(
    "is_authenticated_admin",
  );

  if (error || !isAdmin) {
    redirect("/admin/login?error=invalid");
  }

  return { supabase, user };
}

export async function getAuthorizedUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data: isAdmin, error } = await supabase.rpc(
    "is_authenticated_admin",
  );

  return error || !isAdmin ? null : user;
}
