import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildContentManagerInviteEmail, buildContentManagerPasswordResetEmail } from "../lib/content-manager-email-content.ts";
import { buildStaffLinkUrl, isStaffLinkType } from "../lib/staff-links.ts";
import { contentManagerStatus, normalizeStaffEmail, normalizeStaffName, staffHomePath } from "../lib/staff-roles.ts";

test("staff roles land on the right home page", () => {
  assert.equal(staffHomePath("admin"), "/admin");
  assert.equal(staffHomePath("content_manager"), "/admin/cm");
});

test("content manager status follows revocation and activation", () => {
  assert.equal(contentManagerStatus({ is_active: true, revoked_at: null, activated_at: null }), "invited");
  assert.equal(contentManagerStatus({ is_active: true, revoked_at: null, activated_at: "2026-10-02T12:00:00Z" }), "active");
  assert.equal(contentManagerStatus({ is_active: false, revoked_at: "2026-10-02T12:00:00Z", activated_at: "2026-10-01T12:00:00Z" }), "revoked");
});

test("invite fields are normalized", () => {
  assert.equal(normalizeStaffEmail("  Jane.Doe@Example.COM "), "jane.doe@example.com");
  assert.equal(normalizeStaffEmail("not-an-email"), null);
  assert.equal(normalizeStaffName("  Jane   Doe "), "Jane Doe");
  assert.equal(normalizeStaffName("   "), null);
  assert.equal(normalizeStaffName("x".repeat(121)), null);
});

test("staff links point at the confirm page and only allow invite or recovery", () => {
  const url = new URL(buildStaffLinkUrl("https://theprayerwhiteboard.com", "invite", "abc123"));
  assert.equal(url.origin + url.pathname, "https://theprayerwhiteboard.com/auth/confirm");
  assert.equal(url.searchParams.get("token_hash"), "abc123");
  assert.equal(url.searchParams.get("type"), "invite");
  assert.equal(isStaffLinkType("recovery"), true);
  assert.equal(isStaffLinkType("signup"), false);
  assert.equal(isStaffLinkType("email_change"), false);
});

test("invite email says access was given and includes the link in HTML and text", () => {
  const email = buildContentManagerInviteEmail({ name: "Jane <Doe>", linkUrl: "https://theprayerwhiteboard.com/auth/confirm?token_hash=t&type=invite", signInUrl: "https://theprayerwhiteboard.com/admin/login" });
  assert.match(email.subject, /given Content Management access/);
  assert.match(email.html, /Hi Jane,/);
  assert.match(email.html, /token_hash=t&amp;type=invite/);
  assert.match(email.text, /token_hash=t&type=invite/);
  assert.match(email.text, /\/admin\/login/);
  assert.doesNotMatch(email.html, /<Doe>/);
});

test("admin-sent reset email includes the link", () => {
  const email = buildContentManagerPasswordResetEmail({ name: "", linkUrl: "https://theprayerwhiteboard.com/auth/confirm?token_hash=r&type=recovery" });
  assert.match(email.html, /Hello,/);
  assert.match(email.text, /type=recovery/);
});

test("content management pages allow content managers; admin pages stay admin-only", async () => {
  const hub = await readFile("app/admin/cm/page.tsx", "utf8");
  const page = await readFile("app/admin/cm/points-of-agreement/page.tsx", "utf8");
  const actions = await readFile("app/admin/cm/points-of-agreement/actions.ts", "utf8");
  const managers = await readFile("app/admin/content-managers/page.tsx", "utf8");
  const managerActions = await readFile("app/admin/content-managers/actions.ts", "utf8");

  assert.match(hub, /requireContentManager\(\)/);
  assert.match(page, /requireContentManager\(\)/);
  assert.doesNotMatch(actions, /requireAdmin/);
  assert.equal((actions.match(/requireContentManager\(\)/g) ?? []).length, 7);
  assert.match(managers, /requireAdmin\(\)/);
  assert.equal((managerActions.match(/requireAdmin\(\)/g) ?? []).length, 2);
  assert.ok(managerActions.indexOf("requireAdmin()") < managerActions.indexOf("inviteContentManager({"));
});

test("old Points of Agreement address redirects to the new one", async () => {
  const legacy = await readFile("app/admin/points-of-agreement/page.tsx", "utf8");
  assert.match(legacy, /redirect\("\/admin\/cm\/points-of-agreement"\)/);
});

test("confirm page verifies only on button press, not on page load", async () => {
  const page = await readFile("app/auth/confirm/page.tsx", "utf8");
  const action = await readFile("app/auth/confirm/actions.ts", "utf8");
  assert.doesNotMatch(page, /verifyOtp/);
  assert.match(page, /<form action=\{confirmStaffLink\}/);
  assert.match(action, /verifyOtp\(\{ type, token_hash: tokenHash \}\)/);
  assert.match(action, /isStaffLinkType\(type\)/);
  assert.doesNotMatch(page + action, /console\.(?:log|info|warn|error)/);
});
