import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildConfirmationEmail, buildPreferenceManagementEmail } from "../lib/subscription-email-content.ts";
import { confirmationCopy, categoryLabels } from "../lib/subscription-confirmation-view.ts";
import { offeredEmailCategories } from "../lib/email-categories.ts";

test("every send reads only subscribers of one language, English by default", async () => {
  const source = await readFile("lib/broadcast-recipients.ts", "utf8");
  assert.match(source, /language: "en" \| "es" = "en"/);
  assert.match(source, /\.eq\("email_subscribers\.language", language\)/);
  // Existing broadcasts call it with a category only, so they keep mailing English subscribers only.
  for (const file of ["lib/teaching-broadcast.ts", "lib/weekly-update-broadcast.ts", "lib/devotional-send.ts"]) {
    const code = await readFile(file, "utf8");
    assert.match(code, /loadConfirmedRecipients\("[a-z_]+"\)/, `${file} must not ask for Español recipients`);
    assert.doesNotMatch(code, /loadConfirmedRecipients\([^)]*"es"/, `${file} must not mail Español subscribers yet`);
  }
});

test("the confirmation email is fully Spanish for Español subscribers and unchanged for English", () => {
  const input = { firstName: "María", categories: ["teachings", "devotionals"], confirmationUrl: "https://example.test/espanol/suscribirse/confirmar?token=abc", expiresAt: "2026-10-08T12:00:00Z" };
  const es = buildConfirmationEmail({ ...input, language: "es" });
  assert.equal(es.subject, "Confirma tu suscripción por correo de The Prayer Whiteboard");
  for (const part of [es.html, es.text]) {
    assert.match(part, /Hola María,/);
    assert.match(part, /Nuevas enseñanzas/);
    assert.match(part, /Devocionales de 7 días/);
    assert.match(part, /\/espanol\/suscribirse\/confirmar\?token=abc/);
    assert.doesNotMatch(part, /Confirm My Subscription|Requested email categories|Hi María/);
  }
  const en = buildConfirmationEmail(input);
  assert.equal(en.subject, "Confirm your Prayer Whiteboard email subscription");
  assert.match(en.html, /Confirm My Subscription/);
  assert.match(en.html, /New Teachings/);
});

test("the preference link email follows the subscriber's language", () => {
  const es = buildPreferenceManagementEmail({ firstName: "José", managementUrl: "https://example.test/espanol/preferencias/administrar?token=x", expiresAt: "2026-10-08T12:00:00Z", language: "es" });
  assert.match(es.subject, /enlace seguro de preferencias/);
  assert.match(es.text, /Hola José,/);
  assert.doesNotMatch(es.text, /Manage Email Preferences|Hi José/);
});

test("the Español form never offers Weekly Updates, which have no Spanish version", () => {
  assert.deepEqual([...offeredEmailCategories("es")], ["teachings", "devotionals"]);
  assert.deepEqual([...offeredEmailCategories("en")], ["weekly_updates", "teachings", "devotionals"]);
  assert.deepEqual(categoryLabels(["teachings", "devotionals"], "es"), ["Nuevas enseñanzas", "Devocionales de 7 días"]);
});

test("the Español confirmation page copy is Spanish and links to Español pages", () => {
  for (const status of ["confirmed", "already_confirmed", "expired", "invalid"]) {
    const copy = confirmationCopy(status, "es");
    assert.match(copy.href, /^\/espanol\//);
    assert.doesNotMatch(`${copy.title} ${copy.body} ${copy.link}`, /subscription|Subscribe|confirmed!|email preferences/i);
  }
});

test("Español subscribers are not added to the English Sender groups", async () => {
  const source = await readFile("lib/email-subscriptions.ts", "utf8");
  assert.match(source, /if \(input\.language === "es"\) return;/);
});

test("signing up in the other language needs a confirmation click before the language changes", async () => {
  const source = await readFile("lib/email-subscriptions.ts", "utf8");
  const switchBranch = source.match(/if \(existing && existingIsConfirmed && toLanguage\(existing\.language\) !== language\)[\s\S]*?\n  }\n/)?.[0] ?? "";
  assert.notEqual(switchBranch, "", "the language-switch branch must exist");
  // The request is parked in pending_language and the confirmation email is sent in the new language...
  assert.match(switchBranch, /pending_language: language/);
  assert.match(switchBranch, /deliverConfirmationEmail\(/);
  assert.match(switchBranch, /language,\n/);
  // ...and nothing about the live subscription changes until the token is used.
  const updates = switchBranch.match(/\.update\(/g) ?? [];
  assert.equal(updates.length, 1, "the branch may only record the pending request");
  assert.match(switchBranch, /\.update\(\{ pending_language: language \}\)/);
  assert.doesNotMatch(switchBranch, /replacePreferences/);
  assert.match(source, /language: nextLanguage,\n\s+pending_language: null,/);
});

test("Español routes exist for the form, confirmation and preferences, and the English pages hand Español links over", async () => {
  for (const file of [
    "app/espanol/suscribirse/page.tsx",
    "app/espanol/suscribirse/confirmar/page.tsx",
    "app/espanol/preferencias/page.tsx",
    "app/espanol/preferencias/administrar/page.tsx",
  ]) {
    assert.match(await readFile(file, "utf8"), /lang="es"/, `${file} must be marked as Spanish`);
  }
  const manage = await readFile("app/email-preferences/manage/page.tsx", "utf8");
  assert.match(manage, /preference\?\.language === "es"\) redirect\(`\/espanol\/preferencias\/administrar/);
});
