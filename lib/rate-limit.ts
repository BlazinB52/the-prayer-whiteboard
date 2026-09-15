import "server-only";

import { headers } from "next/headers";

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();

export async function checkRateLimit(name: string, limit: number, windowMs: number) {
  const headerStore = await headers();
  const forwardedFor = headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const key = `${name}:${forwardedFor}`;
  const now = Date.now();
  const current = buckets.get(key);

  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true };
  }

  if (current.count >= limit) return { allowed: false };
  current.count += 1;
  return { allowed: true };
}
