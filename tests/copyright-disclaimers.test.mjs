import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  COPYRIGHT_DISCLAIMER_PATH,
  buildEmailCopyrightDisclaimer,
  canonicalCopyrightDisclaimerUrl,
  safeCopyrightReturnToPath,
} from "../lib/copyright-disclaimer-format.ts";
import { buildDevotionalDayEmail } from "../lib/devotional-email-content.ts";
import { buildTeachingEmail } from "../lib/teaching-email-content.ts";
import { buildWeeklyUpdateEmail } from "../lib/weekly-update-email-content.ts";

const shortContent = `Scripture quotations are from the NIV, ESV, NKJV, and AMP Bibles. Complete copyright acknowledgments and permissions can be viewed here.

Original Content © 2026 The Prayer Whiteboard. All rights reserved.`;

const copyrightDisclaimer = buildEmailCopyrightDisclaimer(shortContent, "https://theprayerwhiteboard.com/copyright-disclaimers");
const AMP_HTML_LINK_PATTERN = /Scripture quotations are from the NIV, ESV, NKJV, and <a href="https:\/\/www\.lockman\.org">AMP<\/a> Bibles/;

test("same-site copyright return paths are accepted and open redirects are rejected", () => {
  assert.equal(safeCopyrightReturnToPath("/teachings/example"), "/teachings/example");
  assert.equal(safeCopyrightReturnToPath("/devotionals/example/day/1"), "/devotionals/example/day/1");
  assert.equal(safeCopyrightReturnToPath("//example.com"), null);
  assert.equal(safeCopyrightReturnToPath("https://example.com"), null);
  assert.equal(safeCopyrightReturnToPath("/https://example.com"), null);
  assert.equal(safeCopyrightReturnToPath("/teachings\\evil"), null);
});

test("email helper renders the current short disclaimer with the canonical page link", () => {
  assert.equal(canonicalCopyrightDisclaimerUrl("https://theprayerwhiteboard.com/"), "https://theprayerwhiteboard.com/copyright-disclaimers");
  assert.match(copyrightDisclaimer.html, /Complete copyright acknowledgments and permissions can be viewed <a href="https:\/\/theprayerwhiteboard\.com\/copyright-disclaimers">here<\/a>\./);
  assert.doesNotMatch(copyrightDisclaimer.html, /<a[^>]*>Complete copyright acknowledgments and permissions<\/a>/);
  assert.match(copyrightDisclaimer.text, /Complete copyright acknowledgments and permissions can be viewed here:\nhttps:\/\/theprayerwhiteboard\.com\/copyright-disclaimers/);
});

test("email disclaimer links AMP and AMPC to the Lockman Foundation in both HTML and plain text", () => {
  const disclaimer = buildEmailCopyrightDisclaimer(
    "Scripture quotations are from the NIV, ESV, NKJV, AMP, and AMPC Bibles. Complete copyright acknowledgments and permissions can be viewed here.",
    "https://theprayerwhiteboard.com/copyright-disclaimers",
  );

  assert.match(disclaimer.html, /NKJV, <a href="https:\/\/www\.lockman\.org">AMP<\/a>, and <a href="https:\/\/www\.lockman\.org">AMPC<\/a> Bibles/);
  assert.match(disclaimer.text, /AMP \(see https:\/\/www\.lockman\.org\), and AMPC \(see https:\/\/www\.lockman\.org\) Bibles/);
});

test("email helper escapes editable disclaimer HTML before linking only here", () => {
  const unsafeDisclaimer = buildEmailCopyrightDisclaimer(
    `Editable <strong>text</strong> can be viewed here. <script>alert("unsafe")</script>`,
    "https://theprayerwhiteboard.com/copyright-disclaimers",
  );

  assert.match(unsafeDisclaimer.html, /Editable &lt;strong&gt;text&lt;\/strong&gt; can be viewed <a href="https:\/\/theprayerwhiteboard\.com\/copyright-disclaimers">here<\/a>\. &lt;script&gt;alert\(&quot;unsafe&quot;\)&lt;\/script&gt;/);
  assert.doesNotMatch(unsafeDisclaimer.html, /<strong>|<script>/);
  assert.equal((unsafeDisclaimer.html.match(/<a /g) ?? []).length, 1);
});

test("teaching emails include the short copyright disclaimer without changing preferences behavior", () => {
  const email = buildTeachingEmail({
    firstName: "Max",
    title: "Aliyah, Israel, and the Harvest",
    summary: "A study of return and ingathering.",
    teachingUrl: "https://theprayerwhiteboard.com/teachings/aliyah-israel-harvest-prayer",
    preferencesUrl: "https://theprayerwhiteboard.com/email-preferences",
    copyrightDisclaimer,
  });

  assert.match(email.html, AMP_HTML_LINK_PATTERN);
  assert.match(email.html, /viewed <a href="https:\/\/theprayerwhiteboard\.com\/copyright-disclaimers">here<\/a>\./);
  assert.match(email.text, /viewed here:\nhttps:\/\/theprayerwhiteboard\.com\/copyright-disclaimers/);
  assert.match(email.html, /Manage your email preferences or unsubscribe/);
  assert.match(email.text, /Manage your email preferences or unsubscribe: https:\/\/theprayerwhiteboard\.com\/email-preferences/);
});

test("devotional emails include the short copyright disclaimer without changing preferences behavior", () => {
  const email = buildDevotionalDayEmail({
    dayNumber: 3,
    totalDays: 7,
    title: "Returning With Singing",
    seriesTitle: "Beyond the Garden",
    anchorScriptures: ["Jeremiah 31:12"],
    devotionalReading: "God gathers His people from far away.",
    confession: "I declare that I am gathered and remembered.",
    journalPrompt: "Where have you felt far from home this week?",
    prayerActivation: "Speak this aloud: I am not forgotten.",
    readUrl: "https://theprayerwhiteboard.com/teachings/beyond-the-garden",
    preferencesUrl: "https://theprayerwhiteboard.com/email-preferences",
    copyrightDisclaimer,
  });

  assert.match(email.html, AMP_HTML_LINK_PATTERN);
  assert.match(email.html, /viewed <a href="https:\/\/theprayerwhiteboard\.com\/copyright-disclaimers">here<\/a>\./);
  assert.match(email.text, /viewed here:\nhttps:\/\/theprayerwhiteboard\.com\/copyright-disclaimers/);
  assert.match(email.html, /Manage your email preferences or unsubscribe/);
  assert.match(email.text, /Manage your email preferences or unsubscribe: https:\/\/theprayerwhiteboard\.com\/email-preferences/);
});

test("weekly update emails include the short copyright disclaimer without changing preferences behavior", () => {
  const email = buildWeeklyUpdateEmail({
    title: "This Week at the Whiteboard",
    bodyMarkdown: "First paragraph.\n\nSecond paragraph.",
    convertedContent: [],
    weeklyUpdateUrl: "https://theprayerwhiteboard.com/weekly-update",
    preferencesUrl: "https://theprayerwhiteboard.com/email-preferences",
    copyrightDisclaimer,
  });

  assert.match(email.html, AMP_HTML_LINK_PATTERN);
  assert.match(email.html, /viewed <a href="https:\/\/theprayerwhiteboard\.com\/copyright-disclaimers">here<\/a>\./);
  assert.match(email.text, /viewed here:\nhttps:\/\/theprayerwhiteboard\.com\/copyright-disclaimers/);
  assert.match(email.html, /Manage your email preferences or unsubscribe/);
  assert.match(email.text, /Manage your email preferences or unsubscribe: https:\/\/theprayerwhiteboard\.com\/email-preferences/);
});

test("weekly update HTML links only the word here, not the surrounding sentence", () => {
  const email = buildWeeklyUpdateEmail({
    title: "This Week at the Whiteboard",
    bodyMarkdown: "First paragraph.",
    convertedContent: [],
    weeklyUpdateUrl: "https://theprayerwhiteboard.com/weekly-update",
    preferencesUrl: "https://theprayerwhiteboard.com/email-preferences",
    copyrightDisclaimer,
  });

  assert.doesNotMatch(email.html, /<a[^>]*>Complete copyright acknowledgments and permissions[^<]*<\/a>/);
  const disclaimerLinks = email.html.match(/<a href="https:\/\/theprayerwhiteboard\.com\/copyright-disclaimers">here<\/a>/g) ?? [];
  assert.equal(disclaimerLinks.length, 1);
});

test("weekly update broadcast and its test-send preview both source the disclaimer through the shared helper", async () => {
  const [broadcast, template, testSendRoute] = await Promise.all([
    readFile("lib/weekly-update-broadcast.ts", "utf8"),
    readFile("lib/weekly-update-email-content.ts", "utf8"),
    readFile("app/api/admin/weekly-update/test-send/route.ts", "utf8"),
  ]);

  assert.match(broadcast, /getEmailCopyrightDisclaimer\(base\)/);
  assert.match(template, /copyrightDisclaimer\?\.html/);
  assert.equal(template.includes("Scripture quotations are from the NIV"), false);
  assert.match(testSendRoute, /getEmailCopyrightDisclaimer\(base\)/);
  assert.match(testSendRoute, /copyrightDisclaimer,/);
});

test("transactional subscription and preference-management emails are not given the content disclaimer", async () => {
  const source = await readFile("lib/email-subscriptions.ts", "utf8");

  assert.equal(source.includes("getEmailCopyrightDisclaimer"), false);
  assert.equal(source.includes("copyrightDisclaimer"), false);
});

test("the public copyright page reads full_page dynamically and validates returnTo", async () => {
  const source = await readFile("app/copyright-disclaimers/page.tsx", "utf8");

  assert.match(source, /\.from\("copyright_disclaimers"\)/);
  assert.match(source, /\.eq\("disclaimer_key", "full_page"\)/);
  assert.match(source, /safeCopyrightReturnToPath\(returnToValue\)/);
  assert.match(source, /Copyright Disclaimers/);
});

test("the admin footers page edits both copyright disclaimer records separately", async () => {
  const [page, actions] = await Promise.all([
    readFile("app/admin/footers/page.tsx", "utf8"),
    readFile("app/admin/footers/actions.ts", "utf8"),
  ]);

  assert.match(page, /Copyright Disclaimers/);
  assert.match(page, /"full_page", "email_short"/);
  assert.match(actions, /updateCopyrightDisclaimer/);
  assert.match(actions, /\.from\("copyright_disclaimers"\)/);
  assert.match(actions, /\.eq\("disclaimer_key", disclaimerKey\)/);
});

test("email broadcasts retrieve the short disclaimer through the shared helper", async () => {
  const [helper, teachingBroadcast, devotionalSend, teachingTemplate, devotionalTemplate] = await Promise.all([
    readFile("lib/copyright-disclaimers.ts", "utf8"),
    readFile("lib/teaching-broadcast.ts", "utf8"),
    readFile("lib/devotional-send.ts", "utf8"),
    readFile("lib/teaching-email-content.ts", "utf8"),
    readFile("lib/devotional-email-content.ts", "utf8"),
  ]);

  assert.match(helper, /getEmailCopyrightDisclaimer/);
  assert.match(helper, /\.eq\("disclaimer_key", disclaimerKey\)/);
  assert.match(teachingBroadcast, /getEmailCopyrightDisclaimer\(base, language\)/);
  assert.match(devotionalSend, /getEmailCopyrightDisclaimer\(base\)/);
  assert.match(teachingTemplate, /copyrightDisclaimer\?\.html/);
  assert.match(devotionalTemplate, /copyrightDisclaimer\?\.html/);
});

test("disclaimer text is seeded once and not copied into both email templates", async () => {
  const [migration, teachingTemplate, devotionalTemplate] = await Promise.all([
    readFile("supabase/migrations/20260927000000_add_copyright_disclaimers.sql", "utf8"),
    readFile("lib/teaching-email-content.ts", "utf8"),
    readFile("lib/devotional-email-content.ts", "utf8"),
  ]);

  assert.match(migration, /Scripture quotations are from the NIV, ESV, NKJV, AMP, and AMPC Bibles/);
  assert.equal(teachingTemplate.includes("Scripture quotations are from the NIV"), false);
  assert.equal(devotionalTemplate.includes("Scripture quotations are from the NIV"), false);
  assert.equal(COPYRIGHT_DISCLAIMER_PATH, "/copyright-disclaimers");
});
