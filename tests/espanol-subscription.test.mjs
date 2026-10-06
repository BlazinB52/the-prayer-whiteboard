import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildConfirmationEmail, buildPreferenceManagementEmail } from "../lib/subscription-email-content.ts";
import { confirmationCopy, categoryLabels } from "../lib/subscription-confirmation-view.ts";
import { offeredEmailCategories } from "../lib/email-categories.ts";

test("the confirmation email is fully Spanish for Español subscribers and unchanged for English", () => {
  const input = { firstName: "María", categories: ["teachings", "devotionals"], confirmationUrl: "https://example.test/espanol/suscribirse/confirmar?token=abc", expiresAt: "2026-10-08T12:00:00Z" };
  const es = buildConfirmationEmail({ ...input, language: "es" });
  assert.equal(es.subject, "Confirmá tu suscripción por correo de The Prayer Whiteboard");
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

test("the Español confirmation page copy is Spanish and links to Español pages", () => {
  for (const status of ["confirmed", "already_confirmed", "expired", "invalid"]) {
    const copy = confirmationCopy(status, "es");
    assert.match(copy.href, /^\/espanol\//);
    assert.doesNotMatch(`${copy.title} ${copy.body} ${copy.link}`, /subscription|Subscribe|confirmed!|email preferences/i);
  }
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

test("Español emails state the expiry in El Salvador time, whatever the server clock is", () => {
  // 02:17 UTC on 9 October is 8:17 p. m. on 8 October in El Salvador (UTC-6, no daylight saving).
  const email = buildConfirmationEmail({ firstName: "Oliver", categories: ["teachings"], confirmationUrl: "https://example.test/x", expiresAt: "2026-10-09T02:17:00Z", language: "es" });
  for (const part of [email.html, email.text]) {
    assert.match(part, /8 de octubre de 2026/);
    assert.match(part, /8:17\s*p\.\s*m\./);
    assert.match(part, /hora de El Salvador/);
  }
  const management = buildPreferenceManagementEmail({ firstName: "Oliver", managementUrl: "https://example.test/y", expiresAt: "2026-10-09T02:17:00Z", language: "es" });
  assert.match(management.text, /8 de octubre de 2026/);
  assert.match(management.text, /hora de El Salvador/);
});

test("the Spanish emails use voseo", () => {
  const email = buildConfirmationEmail({ firstName: "Oliver", categories: ["teachings"], confirmationUrl: "https://example.test/x", expiresAt: "2026-10-09T02:17:00Z", language: "es" });
  assert.match(email.subject, /^Confirmá tu suscripción/);
  assert.match(email.html, /<h1[^>]*>Confirmá tu suscripción por correo<\/h1>/);
  assert.match(email.text, /confirmá que querés recibir/);
  assert.match(email.text, /podés ignorar/);
  assert.match(email.text, /Si no encontrás .* revisá las carpetas/);
  assert.doesNotMatch(email.text, /\b(confirma que deseas|puedes|encuentras|revisa las)\b/);
});
