import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { signTeachingClickUrl, verifyTeachingClick, TEST_CLICK_SUBSCRIBER } from "../lib/teaching-click-link.ts";
import { buildTeachingEmail, teachingEmailTeaser } from "../lib/teaching-email-content.ts";

const TEACHING = "11111111-1111-4111-8111-111111111111";
const SUBSCRIBER = "22222222-2222-4222-8222-222222222222";
const BASE = "https://theprayerwhiteboard.com";

test("the email body is Teaser 1 and the button is the tracked link", () => {
  const teachingUrl = signTeachingClickUrl({ baseUrl: BASE, secret: "s3cret", teachingId: TEACHING, subscriberId: SUBSCRIBER });
  const email = buildTeachingEmail({
    firstName: "Max", title: "The Title", teaserHeading: "A heading", teaserText: "A short teaser.",
    teachingUrl, preferencesUrl: `${BASE}/email-preferences`,
  });

  assert.match(email.html, /<h2[^>]*>A heading<\/h2>/);
  assert.match(email.html, /A short teaser\./);
  assert.ok(email.html.includes(`href="${teachingUrl.replace(/&/g, "&amp;")}"`));
  assert.match(email.text, /A heading\n\nA short teaser\./);
  assert.ok(email.text.includes(teachingUrl));
  // No open-tracking pixel: only the logo image may appear, and it is not present without a logoUrl.
  assert.equal(email.html.includes("<img"), false);
});

test("teaser falls back to the summary only when Teaser 1 is missing", () => {
  assert.deepEqual(teachingEmailTeaser({ teaser_1_heading: "H", teaser_1_text: "T", summary: "S" }), { teaserHeading: "H", teaserText: "T" });
  assert.deepEqual(teachingEmailTeaser({ teaser_1_heading: "H", teaser_1_text: null, summary: "S" }), { teaserHeading: null, teaserText: "S" });
});

test("a click link verifies only for the teaching and subscriber it was signed for", () => {
  const url = new URL(signTeachingClickUrl({ baseUrl: BASE, secret: "s3cret", teachingId: TEACHING, subscriberId: SUBSCRIBER }));
  const sig = url.searchParams.get("sig");

  assert.equal(url.pathname, "/api/email/teaching-click");
  assert.equal(verifyTeachingClick({ secret: "s3cret", teachingId: TEACHING, subscriberId: SUBSCRIBER, signature: sig }), true);
  assert.equal(verifyTeachingClick({ secret: "s3cret", teachingId: TEACHING, subscriberId: TEST_CLICK_SUBSCRIBER, signature: sig }), false);
  assert.equal(verifyTeachingClick({ secret: "other", teachingId: TEACHING, subscriberId: SUBSCRIBER, signature: sig }), false);
  assert.equal(verifyTeachingClick({ secret: "s3cret", teachingId: TEACHING, subscriberId: SUBSCRIBER, signature: "" }), false);
  assert.throws(() => signTeachingClickUrl({ baseUrl: BASE, secret: "", teachingId: TEACHING, subscriberId: SUBSCRIBER }));
});

test("the click route verifies the signature, reads the destination from the database and never blocks the reader", async () => {
  const route = await readFile("app/api/email/teaching-click/route.ts", "utf8");

  assert.ok(route.indexOf("verifyTeachingClick(") < route.indexOf("record_teaching_email_click"));
  assert.match(route, /from\("teachings"\)\.select\("slug"\)/);
  assert.match(route, /subscriberId !== TEST_CLICK_SUBSCRIBER/);
  assert.equal(/searchParams\.get\("(url|next|redirect|to)"\)/.test(route), false, "no caller-supplied destination");
});

test("the broadcast gives each recipient their own tracked link and refuses to send untracked", async () => {
  const source = await readFile("lib/teaching-broadcast.ts", "utf8");

  assert.match(source, /subscriberId: recipient\.id/);
  assert.ok(source.indexOf("Click tracking is not configured") < source.indexOf("deliverToRecipients({"));
});

test("test send uses the tracked link with the non-recording test subscriber", async () => {
  const source = await readFile("app/api/admin/teaching/test-send/route.ts", "utf8");

  assert.match(source, /subscriberId: TEST_CLICK_SUBSCRIBER/);
});

test("clicks are stored once per subscriber per teaching and readable only by admins and the service role", async () => {
  const sql = await readFile("supabase/migrations/20261029000000_teaching_email_clicks.sql", "utf8");

  assert.match(sql, /primary key \(teaching_id, subscriber_id\)/);
  assert.match(sql, /using \(public\.is_authenticated_admin\(\)\)/);
  assert.match(sql, /grant execute on function public\.record_teaching_email_click\(uuid, uuid\) to service_role;/);
  assert.equal(/to (anon|authenticated|public)\b[^;]*record_teaching_email_click/.test(sql), false);
});
