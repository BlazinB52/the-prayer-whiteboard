import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const recovery = await import("../lib/password-recovery.ts");

test("admin login links to password recovery", async () => {
  const source = await readFile("app/admin/login/login-form.tsx", "utf8");
  assert.match(source, /href="\/admin\/forgot-password"/);
  assert.match(source, /Forgot password\?/);
});

test("reset request routes through the PKCE code-exchange callback", async () => {
  const source = await readFile("app/admin/forgot-password/password-recovery-form.tsx", "utf8");
  assert.match(source, /resetPasswordForEmail\(email/);
  assert.match(source, /getPasswordRecoveryRedirect\(siteOrigin\)/);
  assert.equal(
    recovery.getPasswordRecoveryRedirect("https://theprayerwhiteboard.com"),
    "https://theprayerwhiteboard.com/auth/callback?next=/update-password",
  );
  assert.match(source, /same whether or not the address matches an account/);
});

test("auth callback exchanges the code and forwards to a safe path", async () => {
  const route = await readFile("app/auth/callback/route.ts", "utf8");
  assert.match(route, /exchangeCodeForSession\(code\)/);
  assert.match(route, /getSafeAuthCallbackPath\(/);
  assert.match(route, /\/admin\/login\?error=recovery/);
});

test("auth callback rejects external and backslash-normalized redirects", () => {
  assert.equal(recovery.getSafeAuthCallbackPath("/update-password"), "/update-password");
  assert.equal(recovery.getSafeAuthCallbackPath("//evil.example"), "/update-password");
  assert.equal(recovery.getSafeAuthCallbackPath("/\\\\evil.example"), "/update-password");
  assert.equal(recovery.getSafeAuthCallbackPath("/admin"), "/update-password");
});

test("reset-password page is a static fallback with no token handling", async () => {
  const page = await readFile("app/admin/reset-password/page.tsx", "utf8");
  assert.match(page, /This password reset link is no longer valid\. Please request a new one\./);
  assert.match(page, /href="\/admin\/forgot-password"/);
  assert.doesNotMatch(page, /verifyOtp|token_hash|searchParams/);
});

test("successful recovery reaches the authorized password update flow", async () => {
  const page = await readFile("app/update-password/page.tsx", "utf8");
  const form = await readFile("app/update-password/update-password-form.tsx", "utf8");

  assert.match(page, /getAuthorizedUser\(\)/);
  assert.match(page, /redirect\("\/admin\/reset-password\?error=invalid"\)/);
  assert.match(form, /password !== confirmation/);
  assert.match(form, /supabase\.auth\.updateUser\(\{ password \}\)/);
  assert.match(form, /supabase\.auth\.signOut\(\)/);
  assert.match(form, /\/admin\/login\?reset=success/);
});

test("recovery flow logs no token or password", async () => {
  const files = await Promise.all([
    readFile("app/admin/reset-password/page.tsx", "utf8"),
    readFile("app/auth/callback/route.ts", "utf8"),
    readFile("app/admin/forgot-password/password-recovery-form.tsx", "utf8"),
    readFile("app/update-password/update-password-form.tsx", "utf8"),
    readFile("lib/password-recovery.ts", "utf8"),
  ]);
  const source = files.join("\n");

  assert.doesNotMatch(source, /console\.(?:log|info|warn|error)/);
});
