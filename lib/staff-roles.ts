export type StaffRole = "admin" | "content_manager";

export function staffHomePath(role: StaffRole) {
  return role === "admin" ? "/admin" : "/admin/cm";
}

export type ContentManagerStatus = "invited" | "active" | "revoked";

export function contentManagerStatus(row: { is_active: boolean; revoked_at: string | null; activated_at: string | null }): ContentManagerStatus {
  if (!row.is_active || row.revoked_at) return "revoked";
  return row.activated_at ? "active" : "invited";
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeStaffEmail(value: string) {
  const email = value.replace(/^﻿+|﻿+$/g, "").trim().toLowerCase();
  return EMAIL_PATTERN.test(email) && email.length <= 254 ? email : null;
}

export function normalizeStaffName(value: string) {
  const name = value.replace(/\s+/g, " ").trim();
  return name.length >= 1 && name.length <= 120 ? name : null;
}
