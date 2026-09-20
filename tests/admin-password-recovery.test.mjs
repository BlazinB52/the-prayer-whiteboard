import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("admin login links to password recovery", async () => {
  const source = await readFile("app/admin/login/login-form.tsx", "utf8");
  assert.match(source, /href="\/admin\/forgot-password"/);
  assert.match(source, /Forgot password\?/);
});

test("password recovery requests a Supabase reset link through the PKCE callback", async () => {
  const source = await readFile("app/admin/forgot-password/password-recovery-form.tsx", "utf8");
  assert.match(source, /resetPasswordForEmail\(email/);
  assert.match(source, /process\.env\.NODE_ENV === "production"/);
  assert.match(source, /https:\/\/theprayerwhiteboard\.com/);
  assert.match(source, /\/auth\/callback\?next=\/update-password/);
  assert.match(source, /same whether or not the address matches an account/);
});

test("auth callback exchanges the PKCE code before redirecting to the password form", async () => {
  const source = await readFile("app/auth/callback/route.ts", "utf8");
  assert.match(source, /exchangeCodeForSession\(code\)/);
  assert.match(source, /!next\.startsWith\("\/\/"\)/);
  assert.match(source, /\/admin\/login\?error=recovery/);
});

test("password update requires an authorized recovery session", async () => {
  const source = await readFile("app/update-password/page.tsx", "utf8");
  assert.match(source, /getAuthorizedUser\(\)/);
  assert.match(source, /redirect\("\/admin\/login\?error=recovery"\)/);
});

test("password update validates confirmation, updates Supabase, and returns to login", async () => {
  const source = await readFile("app/update-password/update-password-form.tsx", "utf8");
  assert.match(source, /password !== confirmation/);
  assert.match(source, /supabase\.auth\.updateUser\(\{ password \}\)/);
  assert.match(source, /supabase\.auth\.signOut\(\)/);
  assert.match(source, /\/admin\/login\?reset=success/);
});
