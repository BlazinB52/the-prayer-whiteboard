import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("admin login links to password recovery", async () => {
  const source = await readFile("app/admin/login/login-form.tsx", "utf8");
  assert.match(source, /href="\/admin\/forgot-password"/);
  assert.match(source, /Forgot password\?/);
});

test("password recovery requests a Supabase reset link to the admin reset page", async () => {
  const source = await readFile("app/admin/forgot-password/password-recovery-form.tsx", "utf8");
  assert.match(source, /resetPasswordForEmail\(email/);
  assert.match(source, /redirectTo: `\$\{window\.location\.origin\}\/admin\/reset-password`/);
  assert.match(source, /same whether or not the address matches an account/);
});

test("password reset validates confirmation, updates Supabase, and returns to login", async () => {
  const source = await readFile("app/admin/reset-password/reset-password-form.tsx", "utf8");
  assert.match(source, /supabase\.auth\.onAuthStateChange/);
  assert.match(source, /supabase\.auth\.getSession\(\)/);
  assert.match(source, /sessionState === "missing"/);
  assert.match(source, /password !== confirmation/);
  assert.match(source, /supabase\.auth\.updateUser\(\{ password \}\)/);
  assert.match(source, /supabase\.auth\.signOut\(\)/);
  assert.match(source, /\/admin\/login\?reset=success/);
});
