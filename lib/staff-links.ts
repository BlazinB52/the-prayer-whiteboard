// One-time links the admin portal sends to content managers. Each points at
// /auth/confirm, which verifies the token only after the person clicks
// Continue.
export const STAFF_LINK_TYPES = ["invite", "recovery"] as const;
export type StaffLinkType = (typeof STAFF_LINK_TYPES)[number];

export function isStaffLinkType(value: string): value is StaffLinkType {
  return (STAFF_LINK_TYPES as readonly string[]).includes(value);
}

export function buildStaffLinkUrl(siteUrl: string, type: StaffLinkType, tokenHash: string) {
  const url = new URL("/auth/confirm", siteUrl);
  url.searchParams.set("token_hash", tokenHash);
  url.searchParams.set("type", type);
  return url.toString();
}
