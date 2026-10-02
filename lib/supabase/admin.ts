import { redirect } from "next/navigation";
import { createClient } from "./server";
import { staffHomePath, type StaffRole } from "@/lib/staff-roles";

type ServerSupabaseClient = Awaited<ReturnType<typeof createClient>>;

async function loadStaffRole(supabase: ServerSupabaseClient): Promise<StaffRole | null> {
  const { data, error } = await supabase.rpc("current_staff_role");
  if (error) {
    // current_staff_role arrives with the content-managers migration. If the
    // app is deployed first, keep the admin signed in with the older check.
    const { data: isAdmin, error: adminError } = await supabase.rpc("is_authenticated_admin");
    return !adminError && isAdmin ? "admin" : null;
  }
  return data === "admin" || data === "content_manager" ? data : null;
}

// Admin-only pages. A content manager who lands here is sent to the
// Content Management hub instead of the sign-in page.
export async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/admin/login");
  }

  const role = await loadStaffRole(supabase);

  if (role === "content_manager") {
    redirect(staffHomePath(role));
  }

  if (role !== "admin") {
    redirect("/admin/login?error=invalid");
  }

  return { supabase, user };
}

// Content Management pages: admins and content managers.
export async function requireContentManager() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/admin/login");
  }

  const role = await loadStaffRole(supabase);

  if (!role) {
    redirect("/admin/login?error=invalid");
  }

  return { supabase, user, role };
}

// Signed-in admin, or null. Never redirects. Used by admin-only API routes.
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

// Signed-in admin or content manager, or null. Never redirects.
export async function getStaffSession() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const role = await loadStaffRole(supabase);
  return role ? { supabase, user, role } : null;
}
