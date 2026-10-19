import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildDevotionalDayEmail } from "../lib/devotional-email-content.ts";

const input = {
  dayNumber: 2,
  title: "Día 2: Oídos para Oír y Ojos para Ver",
  seriesTitle: "De Gloria en Gloria",
  anchorScriptures: ['Juan 10:27 (RVR1960) — "Mis ovejas oyen mi voz, y yo las conozco, y me siguen..."'],
  devotionalReading: "Lectura.",
  confession: "Confesión.",
  journalPrompt: "Diario.",
  prayerActivation: "Ejercicio.",
  readUrl: "https://example.com/teachings/x",
  preferencesUrl: "https://example.com/espanol/preferencias",
  language: "es",
};

test("an Español devotional email is entirely in Español", () => {
  const email = buildDevotionalDayEmail(input);
  assert.equal(email.subject, "Día 2 de 7 — Día 2: Oídos para Oír y Ojos para Ver");
  for (const text of [email.html, email.text]) {
    assert.match(text, /Pasajes bíblicos clave/);
    assert.match(text, /Leer la enseñanza completa|Leé la enseñanza completa/);
    assert.match(text, /Mañana: Día 3 de De Gloria en Gloria/);
    assert.match(text, /Recibís este mensaje porque te suscribiste a una serie devocional/);
    assert.match(text, /Administrá tus preferencias de correo/);
    assert.equal(/Anchor Scriptures|Read the Full Teaching|You are receiving this|Tomorrow:/.test(text), false, "no English wording is left over");
  }
  assert.match(email.html, /<html lang="es">/);
  assert.match(email.html, /Lectura devocional|La dinámica espiritual|Lectura\./);
});

test("an English devotional email is unchanged when no language is given", () => {
  const email = buildDevotionalDayEmail({ ...input, language: undefined, title: "Day 2: Title", seriesTitle: "Series", anchorScriptures: ['John 10:27 (KJV) — "My sheep hear my voice."'] });
  assert.equal(email.subject, "Day 2 of 7 — Day 2: Title");
  assert.match(email.text, /Anchor Scriptures/);
  assert.match(email.text, /Tomorrow: Day 3 of Series/);
  assert.match(email.html, /<html lang="en">/);
});

test("each language has its own queue, its own recipients and its own cron run", async () => {
  const send = await readFile("lib/devotional-send.ts", "utf8");
  const cron = await readFile("app/api/cron/send-devotionals-es/route.ts", "utf8");
  const vercel = JSON.parse(await readFile("vercel.json", "utf8"));

  // Only series of the run's language are picked, and only that language's mailed series count.
  assert.match(send, /const inQueue = \(spanishIds: Set<string>, language: Language, devotionalId: string\) => spanishIds\.has\(devotionalId\) === \(language === "es"\)/);
  assert.match(send, /\.filter\(\(id\) => inQueue\(spanishIds, language, id\)\)/);
  assert.match(send, /\.filter\(\(candidate\) => inQueue\(spanishIds, language, candidate\.id\)\)/);
  assert.match(send, /recent \?\? \[\]\)\.find\(\(row\) => inQueue\(spanishIds, language, row\.devotional_id as string\)\)/);
  // Recipients, the guard, the footer and the preferences page follow the language.
  assert.match(send, /loadConfirmedRecipients\("devotionals", language\)/);
  assert.match(send, /assertRecipientsChoseLanguage\(recipients, language\)/);
  assert.match(send, /getEmailCopyrightDisclaimer\(base, language\)/);
  assert.match(send, /\$\{base\}\/espanol\/preferencias/);
  // A resume takes its language from the series itself.
  assert.match(send, /isSpanishDevotional\(supabase, devotional\.id\)/);
  // English stays the default, so the existing English cron is unchanged.
  assert.match(send, /processDevotionalQueue\(now = new Date\(\), language: Language = "en"\)/);

  assert.match(cron, /processDevotionalQueue\(new Date\(\), "es"\)/);
  assert.match(cron, /crypto\.timingSafeEqual/);
  assert.ok(cron.indexOf("timingSafeEqual(provided, secret)") < cron.indexOf("processDevotionalQueue("));
  assert.ok(vercel.crons.some((entry) => entry.path === "/api/cron/send-devotionals-es" && /^\d+ \d+ \* \* \*$/.test(entry.schedule)));
  assert.ok(vercel.crons.some((entry) => entry.path === "/api/cron/send-devotionals"), "the English cron is still there");
});
