import "server-only";

import crypto from "node:crypto";
import { buildContentManagerInviteEmail, buildContentManagerPasswordResetEmail } from "@/lib/content-manager-email-content";
import { siteUrl } from "@/lib/email-subscriptions";
import { sendSenderTransactionalEmail } from "@/lib/sender-transactional";
import { buildStaffLinkUrl, type StaffLinkType } from "@/lib/staff-links";
import { contentManagerStatus, type ContentManagerStatus } from "@/lib/staff-roles";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export type ContentManager = {
  id: string;
  userId: string;
  name: string;
  email: string;
  status: ContentManagerStatus;
  invitedAt: string | null;
  lastInviteSentAt: string | null;
  activatedAt: string | null;
  revokedAt: string | null;
};

export type ContentManagerResult = { ok: true; message: string } | { ok: false; error: string };

type AuthorizationRow = {
  id: string;
  user_id: string;
  display_name: string | null;
  email: string | null;
  is_active: boolean;
  invited_at: string | null;
  last_invite_sent_at: string | null;
  activated_at: string | null;
  revoked_at: string | null;
};

const ROW_COLUMNS = "id, user_id, display_name, email, is_active, invited_at, last_invite_sent_at, activated_at, revoked_at";

function getClient() {
  const client = createServiceRoleClient();
  if (!client) throw new Error("Supabase service role is not configured.");
  return client;
}

function toContentManager(row: AuthorizationRow): ContentManager {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.display_name ?? "",
    email: row.email ?? "",
    status: contentManagerStatus(row),
    invitedAt: row.invited_at,
    lastInviteSentAt: row.last_invite_sent_at,
    activatedAt: row.activated_at,
    revokedAt: row.revoked_at,
  };
}

export async function listContentManagers(): Promise<ContentManager[]> {
  const { data, error } = await getClient()
    .from("admin_authorizations")
    .select(ROW_COLUMNS)
    .eq("role", "content_manager")
    .order("created_at", { ascending: true });
  if (error) throw new Error("Content managers could not be loaded.");
  return ((data ?? []) as AuthorizationRow[]).map((row) => toContentManager(row));
}

async function loadContentManager(id: string) {
  const { data } = await getClient()
    .from("admin_authorizations")
    .select(ROW_COLUMNS)
    .eq("id", id)
    .eq("role", "content_manager")
    .maybeSingle();
  return data ? toContentManager(data as AuthorizationRow) : null;
}

function isAlreadyRegistered(error: { code?: string; message?: string; status?: number }) {
  return error.code === "email_exists" || error.code === "user_already_exists" || /already (been )?registered/i.test(error.message ?? "");
}

// Creates a one-time link without Supabase sending its own email. An invite
// link works for a new or not-yet-confirmed address; anyone who already has a
// confirmed account gets a password-reset link instead, which signs them in
// the same way.
async function generateStaffLink(email: string, preferred: StaffLinkType, name?: string) {
  const auth = getClient().auth.admin;

  if (preferred === "invite") {
    const { data, error } = await auth.generateLink({
      type: "invite",
      email,
      options: name ? { data: { display_name: name } } : undefined,
    });
    if (!error && data.properties?.hashed_token && data.user) {
      return { type: "invite" as const, tokenHash: data.properties.hashed_token, userId: data.user.id };
    }
    if (error && !isAlreadyRegistered(error)) {
      return null;
    }
  }

  const { data, error } = await auth.generateLink({ type: "recovery", email });
  if (error || !data.properties?.hashed_token || !data.user) {
    return null;
  }
  return { type: "recovery" as const, tokenHash: data.properties.hashed_token, userId: data.user.id };
}

async function sendLinkEmail(manager: { name: string; email: string }, kind: "invite" | "reset", type: StaffLinkType, tokenHash: string) {
  const base = siteUrl();
  const linkUrl = buildStaffLinkUrl(base, type, tokenHash);
  const email = kind === "invite"
    ? buildContentManagerInviteEmail({ name: manager.name, linkUrl, signInUrl: `${base}/admin/login` })
    : buildContentManagerPasswordResetEmail({ name: manager.name, linkUrl });

  const result = await sendSenderTransactionalEmail({
    toEmail: manager.email,
    toName: manager.name || undefined,
    subject: email.subject,
    html: email.html,
    text: email.text,
  });
  return result.ok;
}

export async function inviteContentManager(input: { name: string; email: string; grantedBy: string }): Promise<ContentManagerResult> {
  const supabase = getClient();

  const { data: existingByEmail } = await supabase
    .from("admin_authorizations")
    .select("id, role")
    .eq("email", input.email)
    .maybeSingle();
  if (existingByEmail) {
    return { ok: false, error: existingByEmail.role === "admin"
      ? "That email belongs to an administrator."
      : "That email is already on the list. Use Resend invite or Restore instead." };
  }

  const link = await generateStaffLink(input.email, "invite", input.name);
  if (!link) {
    return { ok: false, error: "The invitation link could not be created. Please try again." };
  }

  const { data: existingByUser } = await supabase
    .from("admin_authorizations")
    .select("id, role")
    .eq("user_id", link.userId)
    .maybeSingle();
  if (existingByUser) {
    return { ok: false, error: existingByUser.role === "admin"
      ? "That email belongs to an administrator."
      : "That person is already on the list. Use Resend invite or Restore instead." };
  }

  // Replace any password already on the account with a random one, so only
  // the person who receives this email can get in. A new invitee has no
  // password yet; this matters only if the address already had an account.
  const { error: passwordError } = await supabase.auth.admin.updateUserById(link.userId, {
    password: crypto.randomBytes(32).toString("base64url"),
  });
  if (passwordError) {
    return { ok: false, error: "The invitation could not be prepared. Please try again." };
  }

  const now = new Date().toISOString();
  const { error: insertError } = await supabase.from("admin_authorizations").insert({
    user_id: link.userId,
    role: "content_manager",
    is_active: true,
    display_name: input.name,
    email: input.email,
    granted_by: input.grantedBy,
    granted_at: now,
    invited_at: now,
    notes: "Invited from the admin portal.",
  });
  if (insertError) {
    if (link.type === "invite") {
      // Remove the not-yet-confirmed account the invite created, so a retry starts clean.
      await supabase.auth.admin.deleteUser(link.userId);
    }
    return { ok: false, error: "The content manager could not be added. Please try again." };
  }

  const sent = await sendLinkEmail({ name: input.name, email: input.email }, "invite", link.type, link.tokenHash);
  if (!sent) {
    return { ok: false, error: `${input.name} was added, but the invitation email could not be sent. Use Resend invite.` };
  }

  await supabase.from("admin_authorizations").update({ last_invite_sent_at: new Date().toISOString() }).eq("user_id", link.userId);
  return { ok: true, message: `Invitation sent to ${input.email}.` };
}

// Uses the sign-in email on the account (which the person can change) rather
// than the copy stored with their access, and refreshes the stored copy.
async function loadContentManagerWithCurrentEmail(id: string) {
  const manager = await loadContentManager(id);
  if (!manager) return null;
  const { data, error } = await getClient().auth.admin.getUserById(manager.userId);
  const currentEmail = !error && data.user?.email ? data.user.email.trim().toLowerCase() : null;
  if (!currentEmail) return null;
  if (currentEmail !== manager.email) {
    await getClient().from("admin_authorizations").update({ email: currentEmail }).eq("id", manager.id);
  }
  return { ...manager, email: currentEmail };
}

export async function resendContentManagerInvite(id: string): Promise<ContentManagerResult> {
  const manager = await loadContentManagerWithCurrentEmail(id);
  if (!manager) return { ok: false, error: "That content manager could not be found." };
  if (manager.status === "revoked") return { ok: false, error: "Restore access before resending the invitation." };

  const link = await generateStaffLink(manager.email, "invite", manager.name);
  if (!link || link.userId !== manager.userId) {
    return { ok: false, error: "The invitation link could not be created. Please try again." };
  }

  const sent = await sendLinkEmail(manager, "invite", link.type, link.tokenHash);
  if (!sent) return { ok: false, error: "The invitation email could not be sent. Please try again." };

  await getClient().from("admin_authorizations").update({ last_invite_sent_at: new Date().toISOString() }).eq("id", manager.id);
  return { ok: true, message: `Invitation resent to ${manager.email}.` };
}

export async function sendContentManagerPasswordReset(id: string): Promise<ContentManagerResult> {
  const manager = await loadContentManagerWithCurrentEmail(id);
  if (!manager) return { ok: false, error: "That content manager could not be found." };
  if (manager.status === "revoked") return { ok: false, error: "Restore access before sending a password reset." };

  const link = await generateStaffLink(manager.email, "recovery");
  if (!link || link.userId !== manager.userId) {
    return { ok: false, error: "The password-reset link could not be created. Please try again." };
  }

  const sent = await sendLinkEmail(manager, "reset", link.type, link.tokenHash);
  if (!sent) return { ok: false, error: "The password-reset email could not be sent. Please try again." };
  return { ok: true, message: `Password-reset email sent to ${manager.email}.` };
}

export async function revokeContentManager(id: string): Promise<ContentManagerResult> {
  const manager = await loadContentManager(id);
  if (!manager) return { ok: false, error: "That content manager could not be found." };

  const { error } = await getClient()
    .from("admin_authorizations")
    .update({ is_active: false, revoked_at: new Date().toISOString() })
    .eq("id", manager.id)
    .eq("role", "content_manager");
  if (error) return { ok: false, error: "Access could not be revoked. Please try again." };
  return { ok: true, message: `Access revoked for ${manager.name || manager.email}.` };
}

export async function restoreContentManager(id: string): Promise<ContentManagerResult> {
  const manager = await loadContentManager(id);
  if (!manager) return { ok: false, error: "That content manager could not be found." };

  const { error } = await getClient()
    .from("admin_authorizations")
    .update({ is_active: true, revoked_at: null })
    .eq("id", manager.id)
    .eq("role", "content_manager");
  if (error) return { ok: false, error: "Access could not be restored. Please try again." };
  return { ok: true, message: `Access restored for ${manager.name || manager.email}.` };
}
