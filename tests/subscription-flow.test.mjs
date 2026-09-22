import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { categoryLabels, confirmationCopy } from "../lib/subscription-confirmation-view.ts";
import { hasConfirmedSubscriptionState } from "../lib/subscription-status.ts";

test("devotional CTAs use the unified subscription page with devotional context", async () => {
  const [publicDevotionals, subscribePage, subscribeForm, slugStart, genericStart] = await Promise.all([
    readFile("lib/public-devotionals.ts", "utf8"),
    readFile("app/subscribe/page.tsx", "utf8"),
    readFile("app/subscribe/subscribe-form.tsx", "utf8"),
    readFile("app/devotionals/[slug]/start/page.tsx", "utf8"),
    readFile("app/devotionals/start/page.tsx", "utf8"),
  ]);

  assert.match(publicDevotionals, /\/subscribe\?category=devotionals&devotional=/);
  assert.match(subscribePage, /getPublishedDevotionalSeriesBySlug\(requestedSlug\)/);
  assert.match(subscribeForm, /devotionals: Boolean\(devotional\)/);
  assert.match(subscribeForm, /weekly_updates: false/);
  assert.match(subscribeForm, /teachings: false/);
  assert.match(slugStart, /redirect\(getDevotionalStartPath\(series\)\)/);
  assert.match(genericStart, /redirect\(getDevotionalStartPath\(series\)\)/);
});

test("confirmed subscribers add preferences without another confirmation", async () => {
  const source = await readFile("lib/email-subscriptions.ts", "utf8");
  const confirmedBranch = source.match(/if \(existing && existingIsConfirmed\)[\s\S]*?let subscriberId/)?.[0] ?? "";
  assert.match(confirmedBranch, /status\", \"active\"/);
  assert.match(confirmedBranch, /new Set\(\[\.\.\.activeCategories, \.\.\.fields\.value\.categories\]\)/);
  assert.match(confirmedBranch, /alreadyConfirmed: true/);
  assert.doesNotMatch(confirmedBranch, /createAccessToken|deliverConfirmationEmail/);
});

test("already-confirmed 5787 signup preserves its slug through Sender group resolution", async () => {
  const [subscribeForm, subscriptions, senderGroups] = await Promise.all([
    readFile("app/subscribe/subscribe-form.tsx", "utf8"),
    readFile("lib/email-subscriptions.ts", "utf8"),
    readFile("lib/devotional-sender-groups.ts", "utf8"),
  ]);
  const confirmedBranch = subscriptions.match(/if \(existing && existingIsConfirmed\)[\s\S]*?let subscriberId/)?.[0] ?? "";

  assert.match(subscribeForm, /name="devotionalSlug" value=\{devotional\.slug\}/);
  assert.match(subscriptions, /getPublishedDevotionalSeriesBySlug\(slug\)/);
  assert.match(confirmedBranch, /devotionalSlug: devotionalContext\.value\?\.slug/);
  assert.match(senderGroups, /process\.env\.SENDER_DEVOTIONAL_MASTER_GROUP_ID/);
  assert.match(senderGroups, /process\.env\.SENDER_DEVOTIONAL_SERIES_GROUP_IDS/);
});

test("a previously confirmed devotional subscriber is not sent through double opt-in again", () => {
  assert.equal(hasConfirmedSubscriptionState("confirmed", null), true);
  assert.equal(hasConfirmedSubscriptionState("pending", "legacy_devotional_imported"), true);
  assert.equal(hasConfirmedSubscriptionState("pending", "double_opt_in_confirmed"), true);
  assert.equal(hasConfirmedSubscriptionState("pending", null), false);
  assert.equal(hasConfirmedSubscriptionState("unsubscribed", "double_opt_in_confirmed"), false);
});

test("devotional signup success copy displays the title without a duplicate prefix", async () => {
  const source = await readFile("app/subscribe/subscribe-form.tsx", "utf8");

  assert.match(source, /title\.replace\(\/\^7-Day Devotional:\\s\*\/i, ""\)/);
  assert.match(source, /You&.*signed up for \{devotionalTitle\}\./);
  assert.match(source, /Once confirmed, you&.*signed up for \{devotionalTitle\}\./);
  assert.doesNotMatch(source, /signed up for the 7-Day Devotional:/);
  assert.match(source, /Your email preferences have been updated\./);
  assert.match(source, /Once confirmed, you&.*receive the email updates you selected\./);
});

test("subscribe heading reflects the existing submission result state", async () => {
  const source = await readFile("app/subscribe/subscribe-form.tsx", "utf8");

  assert.match(source, /state\.submitted \? "Your Email Preferences" : "Choose Your Email Updates"/);
});

test("Sender group sync happens only after confirmation or for an already-confirmed subscriber", async () => {
  const source = await readFile("lib/email-subscriptions.ts", "utf8");
  const confirmedBranch = source.match(/if \(existing && existingIsConfirmed\)[\s\S]*?let subscriberId/)?.[0] ?? "";
  const pendingBranch = source.match(/let subscriberId[\s\S]*?export async function confirmSubscriptionToken/)?.[0] ?? "";
  const confirmation = source.match(/export async function confirmSubscriptionToken[\s\S]*?export async function requestManagementLink/)?.[0] ?? "";

  assert.match(confirmedBranch, /await syncConfirmedSubscriber\(\{[\s\S]*?categories,/);
  // The double opt-in gate: an unconfirmed subscriber is never sent to Sender.
  assert.doesNotMatch(pendingBranch, /syncConfirmedSubscriber/);
  assert.match(confirmation, /await syncConfirmedSubscriber\(\{[\s\S]*?categories,/);
  assert.match(source, /sender_sync_status: "failed"/);
  assert.match(source, /sender_sync_status: "synced"/);
});

test("every selected category is synced to Sender and sync failures are recorded", async () => {
  const source = await readFile("lib/email-subscriptions.ts", "utf8");
  const sync = source.match(/async function syncConfirmedSubscriber[\s\S]*?\n}/)?.[0] ?? "";

  assert.match(sync, /getSenderGroupIdsForCategories\(input\.categories, input\.devotionalSlug\)/);
  assert.match(sync, /if \(!groupIds\.length\) return;/);
  assert.match(sync, /message_type: "preference_sync"/);
  assert.match(sync, /status: "failed"/);
  assert.match(sync, /metadata: \{ categories: input\.categories, groupIds \}/);
});

test("confirmation result copy lists one active category", () => {
  const copy = confirmationCopy("confirmed");
  assert.equal(copy.title, "Subscription confirmed!");
  assert.equal(copy.body, "Your email preferences are active. You are subscribed to:");
  assert.deepEqual(categoryLabels(["weekly_updates"]), ["Weekly Updates"]);
});

test("confirmation result copy lists all active categories", () => {
  assert.deepEqual(categoryLabels(["weekly_updates", "teachings", "devotionals"]), [
    "Weekly Updates",
    "New Teachings",
    "7-Day Devotionals",
  ]);
});

test("manage preferences button keeps white text in all visible states", async () => {
  const source = await readFile("app/subscribe/confirm/page.tsx", "utf8");
  assert.match(source, /!text-white/);
  assert.match(source, /hover:!text-white/);
  assert.match(source, /focus-visible:!text-white/);
  assert.match(source, /active:!text-white/);
  assert.match(source, /visited:!text-white/);
});

test("confirmed subscriber management-link request creates a token before delivery", async () => {
  const source = await readFile("lib/email-subscriptions.ts", "utf8");
  assert.match(source, /subscriber\?\.status === "confirmed"/);
  assert.match(source, /const access = await createAccessToken\(subscriber\.id, "management"\)/);
  assert.match(source, /await deliverPreferenceManagementEmail\(/);
});

test("management token creation stores only hashed tokens", async () => {
  const source = await readFile("lib/email-subscriptions.ts", "utf8");
  assert.match(source, /token_hash: tokenHash\(token\)/);
  assert.doesNotMatch(source, /token:\s*token/);
});

test("management delivery records Sender acceptance and failure paths", async () => {
  const source = await readFile("lib/email-subscriptions.ts", "utf8");
  assert.match(source, /status: "sent"/);
  assert.match(source, /provider_message_id: result\.providerMessageId/);
  assert.match(source, /status: "failed"/);
  assert.match(source, /error: result\.reason/);
});

test("unknown preference addresses receive a neutral submitted response", async () => {
  const source = await readFile("lib/email-subscriptions.ts", "utf8");
  assert.match(source, /if \(subscriber\?\.status === "confirmed" \|\| subscriber\?\.status === "unsubscribed"\)/);
  assert.match(source, /return \{ submitted: true \}/);
});

test("preference request rate limiting stays outside subscriber lookup", async () => {
  const source = await readFile("app/email-preferences/actions.ts", "utf8");
  assert.match(source, /checkRateLimit\("email-preferences", 5, 15 \* 60 \* 1000\)/);
  assert.match(source, /if \(!limit\.allowed\) return \{ error: "Too many requests/);
});

test("older unused management tokens are invalidated before a new token is created", async () => {
  const source = await readFile("lib/email-subscriptions.ts", "utf8");
  assert.match(source, /\.eq\("token_type", tokenType\)/);
  assert.match(source, /\.is\("used_at", null\)/);
  assert.match(source, /\.insert\(\{\s*subscriber_id: subscriberId,\s*token_type: tokenType,/s);
});

test("admin subscribers page searches and paginates server-side", async () => {
  const source = await readFile("app/admin/subscribers/page.tsx", "utf8");
  assert.match(source, /const PAGE_SIZE = 25/);
  assert.match(source, /searchParams/);
  assert.match(source, /\.select\("id, first_name, email, status, confirmed_at, updated_at, sender_sync_status, sender_sync_error", \{ count: "exact" \}\)/);
  assert.match(source, /\.range\(from, to\)/);
  assert.match(source, /\.or\(`first_name\.ilike/);
  assert.match(source, /Showing \$\{firstShown\}-\$\{lastShown\} of \$\{total\}/);
});

test("admin subscribers page preserves masked display and normal scrolling", async () => {
  const source = await readFile("app/admin/subscribers/page.tsx", "utf8");
  assert.match(source, /maskEmail\(subscriber\.email\)/);
  assert.match(source, /overflow-x-auto/);
  assert.doesNotMatch(source, /mt-8 overflow-hidden rounded-2xl/);
});

test("public header exposes desktop and mobile Subscribe calls to action", async () => {
  const source = await readFile("app/public-header.tsx", "utf8");
  assert.match(source, /href="\/subscribe"/);
  assert.match(source, /hidden md:inline-flex/);
  assert.match(source, /md:hidden/);
  assert.match(source, /Subscribe/);
  assert.match(source, /!text-white/);
  assert.match(source, /hover:!text-white/);
  assert.match(source, /focus-visible:!text-white/);
  assert.match(source, /active:!text-white/);
  assert.match(source, /visited:!text-white/);
});

test("public footer exposes a visible Subscribe call to action", async () => {
  const source = await readFile("app/public-footer.tsx", "utf8");
  assert.match(source, /href="\/subscribe"/);
  assert.match(source, />\s*Subscribe\s*</);
  assert.match(source, /!text-\[#1d352b\]/);
  assert.match(source, /hover:!text-\[#1d352b\]/);
  assert.match(source, /active:!text-\[#1d352b\]/);
  assert.match(source, /visited:!text-\[#1d352b\]/);
});
