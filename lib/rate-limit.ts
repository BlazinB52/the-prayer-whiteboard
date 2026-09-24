import "server-only";

import { headers } from "next/headers";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

// Backed by the check_rate_limit() Postgres function (see
// supabase/migrations/20260924000000_add_rate_limit_buckets.sql) instead of
// an in-memory Map, since serverless invocations don't share process memory
// and an in-memory limiter can be bypassed by spreading requests across
// instances.
//
// Fails open (allows the request) if the DB call errors or the service-role
// client isn't configured, so a rate-limit outage degrades to "no limiting"
// rather than blocking legitimate subscribers.
export async function checkRateLimit(name: string, limit: number, windowMs: number) {
  const headerStore = await headers();
  const forwardedFor = headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const key = `${name}:${forwardedFor}`;

  const client = createServiceRoleClient();
  if (!client) return { allowed: true };

  const { data, error } = await client.rpc("check_rate_limit", {
    p_key: key,
    p_limit: limit,
    p_window_ms: windowMs,
  });

  if (error) {
    console.error("checkRateLimit: RPC failed, failing open", error);
    return { allowed: true };
  }

  return { allowed: data === true };
}
