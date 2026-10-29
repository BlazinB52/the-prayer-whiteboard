import crypto from "node:crypto";

// The teaching email's button points at /api/email/teaching-click. The link names the teaching and the
// subscriber and carries an HMAC of both, so a click can be attributed to a subscriber but nobody can
// forge clicks for someone else. "test" stands in for the subscriber in an administrator's test send:
// it redirects like a real link but records nothing.
export const TEST_CLICK_SUBSCRIBER = "test";

function sign(secret: string, teachingId: string, subscriberId: string) {
  return crypto.createHmac("sha256", `teaching-click:${secret}`).update(`${teachingId}:${subscriberId}`).digest("base64url");
}

export function teachingClickSecret() {
  return process.env.TEACHING_CLICK_SECRET || process.env.SUPABASE_WEBHOOK_SECRET || "";
}

export function signTeachingClickUrl(input: { baseUrl: string; secret: string; teachingId: string; subscriberId: string }) {
  if (!input.secret) throw new Error("Click tracking is not configured: set TEACHING_CLICK_SECRET.");
  const params = new URLSearchParams({
    t: input.teachingId,
    s: input.subscriberId,
    sig: sign(input.secret, input.teachingId, input.subscriberId),
  });
  return `${input.baseUrl}/api/email/teaching-click?${params.toString()}`;
}

export function verifyTeachingClick(input: { secret: string; teachingId: string; subscriberId: string; signature: string }) {
  if (!input.secret || !input.signature) return false;
  const expected = Buffer.from(sign(input.secret, input.teachingId, input.subscriberId));
  const provided = Buffer.from(input.signature);
  return expected.length === provided.length && crypto.timingSafeEqual(expected, provided);
}
