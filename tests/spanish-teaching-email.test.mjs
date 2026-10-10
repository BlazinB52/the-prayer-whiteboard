import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  FALLBACK_EMAIL_COPYRIGHT_DISCLAIMER,
  FALLBACK_EMAIL_COPYRIGHT_DISCLAIMER_ES,
  buildEmailCopyrightDisclaimer,
  canonicalCopyrightDisclaimerUrl,
} from "../lib/copyright-disclaimer-format.ts";
import { buildTeachingEmail } from "../lib/teaching-email-content.ts";

const BASE = "https://theprayerwhiteboard.com";
const spanishDisclaimer = buildEmailCopyrightDisclaimer(FALLBACK_EMAIL_COPYRIGHT_DISCLAIMER_ES, canonicalCopyrightDisclaimerUrl(BASE, "es"), "es");
const englishDisclaimer = buildEmailCopyrightDisclaimer(FALLBACK_EMAIL_COPYRIGHT_DISCLAIMER, canonicalCopyrightDisclaimerUrl(BASE));

const input = {
  firstName: "Brent",
  title: "Caminar en la Luz y Recordar el Pacto",
  summary: "Dios ha hecho a los creyentes santos en luz.",
  teachingUrl: `${BASE}/teachings/caminar-en-la-luz-y-recordar-el-pacto`,
  preferencesUrl: `${BASE}/espanol/preferencias`,
};

test("a Spanish teaching email is entirely in Salvadoran Spanish with the Español footer", () => {
  const email = buildTeachingEmail({ ...input, language: "es", copyrightDisclaimer: spanishDisclaimer });

  assert.equal(email.subject, "Nueva enseñanza: Caminar en la Luz y Recordar el Pacto");
  // Español emails open with just "Hola," and never use the subscriber's name, even when one is known.
  assert.match(email.html, />Hola,<\/p>/);
  assert.equal(email.html.includes("Brent"), false);
  assert.match(email.text, /^Hola,\n/);
  assert.equal(email.text.includes("Brent"), false);
  assert.equal(email.html.includes("Friend"), false);
  assert.match(email.html, /Se publicó una nueva enseñanza en The Prayer Whiteboard: <strong><em>Caminar en la Luz y Recordar el Pacto<\/em><\/strong>\./);
  assert.match(email.html, />Leer la enseñanza completa<\/a>/);
  assert.match(email.html, /Recibís este mensaje porque te suscribiste a Nuevas enseñanzas de Prayer Whiteboard\./);
  assert.match(email.html, /<a href="https:\/\/theprayerwhiteboard\.com\/espanol\/preferencias"[^>]*>Administrá tus preferencias de correo o cancelá tu suscripción<\/a>/);
  assert.match(email.text, /Leé la enseñanza completa:\nhttps:\/\/theprayerwhiteboard\.com\/teachings\/caminar-en-la-luz-y-recordar-el-pacto/);

  for (const english of ["Hi Brent", "A new teaching has been published", "Read the Full Teaching", "You are receiving this", "Manage your email preferences", "Scripture quotations"]) {
    assert.equal(email.html.includes(english), false, `${english} must not appear in the Spanish email`);
    assert.equal(email.text.includes(english), false, `${english} must not appear in the Spanish email text`);
  }
});

test("the Spanish email footer lists only RVR1960 and NVI, links aquí to the Español copyright page, and carries the prescribed acknowledgments", () => {
  assert.match(spanishDisclaimer.html, /Los reconocimientos de derechos de autor completos se pueden ver <a href="https:\/\/theprayerwhiteboard\.com\/espanol\/derechos-de-autor">aquí<\/a>\./);
  assert.match(spanishDisclaimer.text, /se pueden ver aquí:\nhttps:\/\/theprayerwhiteboard\.com\/espanol\/derechos-de-autor/);

  for (const text of [spanishDisclaimer.html, spanishDisclaimer.text]) {
    assert.match(text, /RVR1960/);
    assert.match(text, /Utilizado con permiso/);
    assert.match(text, /Usado con permiso de Biblica, Inc\./);
    assert.match(text, /Reina-Valera 1960® es una marca registrada de Sociedades Bíblicas Unidas/);
    assert.match(text, /© 1999, 2015, 2022 por Biblica, Inc\./);
    for (const gone of ["NIV", "ESV", "NKJV", "AMP", "Lockman", "here"]) {
      assert.equal(new RegExp(`\\b${gone}\\b`).test(text.replace(/NVI/g, "")), false, `${gone} must not appear in the Spanish footer`);
    }
  }
});

test("the English teaching email is unchanged by the Spanish support", () => {
  const email = buildTeachingEmail({ ...input, title: "Shuttering the Past", summary: null, preferencesUrl: `${BASE}/email-preferences`, copyrightDisclaimer: englishDisclaimer });

  assert.equal(email.subject, "New teaching: Shuttering the Past");
  assert.match(email.html, /Hi Brent,/);
  assert.match(email.html, /A new teaching has been published on The Prayer Whiteboard — <strong><em>Shuttering the Past<\/em><\/strong>\./);
  assert.match(email.html, />Read the Full Teaching<\/a>/);
  assert.match(email.html, /You are receiving this because you subscribed to Prayer Whiteboard New Teachings\. <a href="https:\/\/theprayerwhiteboard\.com\/email-preferences"[^>]*>Manage your email preferences or unsubscribe<\/a>\./);
  assert.match(email.html, /NIV, ESV, NKJV, <a href="https:\/\/www\.lockman\.org">AMP<\/a>, and <a href="https:\/\/www\.lockman\.org">AMPC<\/a> Bibles/);
  assert.equal(email.html.includes("Nueva enseñanza"), false);
});

test("an Español teaching is really sent in Spanish, in its own language only", async () => {
  const [broadcast, state] = await Promise.all([
    readFile("lib/teaching-broadcast.ts", "utf8"),
    readFile("lib/teaching-email-state.ts", "utf8"),
  ]);

  // Only a language with no email (neither English nor Español) is skipped.
  assert.match(broadcast, /if \(teaching\.language !== "en" && teaching\.language !== "es"\) return \{ status: "skipped_language" as const \};/);
  // Everything about the send comes from the teaching's own language.
  assert.match(broadcast, /const language = teaching\.language;/);
  assert.match(broadcast, /loadConfirmedRecipients\("teachings", language\)/);
  assert.match(broadcast, /getEmailCopyrightDisclaimer\(base, language\)/);
  assert.match(broadcast, /language === "es" \? `\$\{base\}\/espanol\/preferencias` : `\$\{base\}\/email-preferences`/);
  assert.match(broadcast, /\n\s+copyrightDisclaimer,\r?\n\s+language,\r?\n\s+\}\),/);
  // The count shown in the admin box is the list that send reads.
  assert.match(state, /loadConfirmedRecipients\("teachings", language\)/);
  assert.equal(state.includes('language === "es"'), false, "the admin count must not skip Español");
});

test("the Español footer for emails is read from the managed Español short footer", async () => {
  const source = await readFile("lib/copyright-disclaimers.ts", "utf8");
  assert.match(source, /\.eq\("id", ESPANOL_COPYRIGHT_SHORT_FOOTER_ID\)/);
  assert.match(source, /canonicalCopyrightDisclaimerUrl\(baseUrl, "es"\)/);
});
