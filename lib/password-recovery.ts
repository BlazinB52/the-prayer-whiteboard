const SAFE_AUTH_CALLBACK_PATHS = new Set(["/update-password"]);

// The Supabase browser/server clients here (lib/supabase/client.ts,
// lib/supabase/server.ts) use @supabase/ssr, which defaults to PKCE flow, and
// the project's "Reset Password" email template is Supabase's stock default
// (uses {{ .ConfirmationURL }}, verified against production Auth config).
// That means a click always goes through Supabase's own hosted /verify
// endpoint first, which consumes the token itself and redirects back with a
// "?code=" query param — never a "token_hash"/"type" pair. So the redirect
// target has to be /auth/callback, which does the code exchange
// (app/auth/callback/route.ts), not a page that expects token_hash directly.
export function getPasswordRecoveryRedirect(origin: string) {
  return `${origin}/auth/callback?next=/update-password`;
}

export function getSafeAuthCallbackPath(value: string | null) {
  return value && SAFE_AUTH_CALLBACK_PATHS.has(value) ? value : "/update-password";
}
