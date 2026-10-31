import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/service-role";

// Who an item can be sent to, and who it has been sent to. The Administrator chooses the people each time, and can send the
// same item to others later, before it is published. Only the people ticked are emailed, and nobody is emailed twice.

export type ContentManagerOption = { userId: string; name: string };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** The ids ticked on a send form (checkboxes named "to"), de-duplicated and checked to be ids. */
export function readRecipientIds(formData: FormData | undefined): string[] {
  if (!formData) return [];
  const ids = formData.getAll("to").filter((value): value is string => typeof value === "string" && UUID_PATTERN.test(value));
  return [...new Set(ids)];
}

/** Every active Content Manager who has accepted their invitation, by name (falling back to their email address). */
export async function listActiveContentManagers(): Promise<ContentManagerOption[]> {
  const supabase = createServiceRoleClient();
  if (!supabase) return [];
  const { data } = await supabase
    .from("admin_authorizations")
    .select("user_id, email, display_name")
    .eq("role", "content_manager")
    .eq("is_active", true)
    .is("revoked_at", null)
    .not("activated_at", "is", null);

  const people: ContentManagerOption[] = [];
  for (const row of data ?? []) {
    if (!row.user_id) continue;
    let name = typeof row.display_name === "string" ? row.display_name.trim() : "";
    if (!name) name = typeof row.email === "string" ? row.email.trim() : "";
    if (!name) {
      const { data: found } = await supabase.auth.admin.getUserById(row.user_id);
      name = found.user?.email?.trim() ?? "Content Manager";
    }
    people.push({ userId: row.user_id, name });
  }
  return people.sort((a, b) => a.name.localeCompare(b.name));
}
