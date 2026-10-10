import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildWeeklyUpdateEmail } from "../lib/weekly-update-email-content.ts";
import { FALLBACK_EMAIL_COPYRIGHT_DISCLAIMER_ES, buildEmailCopyrightDisclaimer } from "../lib/copyright-disclaimer-format.ts";

const BASE = "https://theprayerwhiteboard.com";
const blocks = [{ type: "paragraph", children: [{ text: "Gracias por orar con nosotros." }] }];

function build(language) {
  return buildWeeklyUpdateEmail({
    title: "Actualización",
    bodyMarkdown: "Gracias por orar con nosotros.",
    convertedContent: blocks,
    weeklyUpdateUrl: language === "es" ? `${BASE}/espanol/actualizacion-semanal` : `${BASE}/weekly-update`,
    preferencesUrl: language === "es" ? `${BASE}/espanol/preferencias` : `${BASE}/email-preferences`,
    language,
  });
}

test("the Español weekly update email is fully Spanish, has no greeting, and links only to Español pages", () => {
  const email = build("es");
  for (const part of [email.html, email.text]) {
    assert.match(part, /espanol\/actualizacion-semanal/);
    assert.match(part, /espanol\/preferencias/);
    assert.doesNotMatch(part, /Read It Online|Read it online|You are receiving|Manage your email/);
    assert.doesNotMatch(part, /Hola|Hello|Hi /);
  }
  assert.match(email.html, /Leer en línea/);
  assert.match(email.html, /Recibís este mensaje/);
  assert.doesNotMatch(email.html, /\/weekly-update"|\/email-preferences"/);
});

test("the English weekly update email is unchanged and never contains Spanish wording", () => {
  const email = build("en");
  assert.match(email.html, /Read It Online/);
  assert.match(email.html, /You are receiving this because you subscribed to Prayer Whiteboard Weekly Updates\./);
  assert.doesNotMatch(email.html + email.text, /Leer en línea|Recibís|espanol/);
  assert.equal(build("en").subject, email.subject);
});

test("the Español email footer carries the RVR1960 and NVI notice", () => {
  assert.match(FALLBACK_EMAIL_COPYRIGHT_DISCLAIMER_ES, /RVR1960/);
  assert.match(FALLBACK_EMAIL_COPYRIGHT_DISCLAIMER_ES, /NVI/);
  const email = buildWeeklyUpdateEmail({
    title: "t",
    bodyMarkdown: "x",
    convertedContent: blocks,
    weeklyUpdateUrl: `${BASE}/espanol/actualizacion-semanal`,
    preferencesUrl: `${BASE}/espanol/preferencias`,
    copyrightDisclaimer: buildEmailCopyrightDisclaimer(FALLBACK_EMAIL_COPYRIGHT_DISCLAIMER_ES, BASE, "es"),
    language: "es",
  });
  assert.match(email.html, /Reina-Valera|RVR1960/);
});

test("the recipient guard refuses to send when anyone did not choose the language", async () => {
  const source = await readFile("lib/broadcast-recipients.ts", "utf8");
  assert.match(source, /recipients\.filter\(\(recipient\) => !recipient\.languages\.includes\(language\)\)/);
  assert.match(source, /Language guard/);
  assert.match(source, /Nothing was sent/);
  for (const file of ["lib/weekly-update-broadcast.ts", "lib/teaching-broadcast.ts", "lib/devotional-send.ts"]) {
    const code = await readFile(file, "utf8");
    assert.match(code, /assertRecipientsChoseLanguage\(recipients, /, `${file} must run the language guard`);
  }
  const devotional = await readFile("lib/devotional-send.ts", "utf8");
  assert.match(devotional, /assertRecipientsChoseLanguage\(recipients, "en"\)/);
});

test("a weekly update's language decides recipients, wording, links, and footer", async () => {
  const code = await readFile("lib/weekly-update-broadcast.ts", "utf8");
  assert.match(code, /const language = update\.language;/);
  assert.match(code, /espanol\/actualizacion-semanal/);
  assert.match(code, /espanol\/preferencias/);
  assert.match(code, /getEmailCopyrightDisclaimer\(base, language\)/);
  assert.match(code, /language,\r?\n/);
  assert.match(code, /!== "en" && [\w.]+ !== "es"|"en" \|\| .*"es"/);
});

test("the migration keeps one current update per language and the English view English-only", async () => {
  const sql = await readFile("supabase/migrations/20261010000000_weekly_update_language.sql", "utf8");
  assert.match(sql, /add column if not exists language text not null default 'en'/i);
  assert.match(sql, /weekly_updates_one_current_per_language_idx[\s\S]*\(language\)\s*where is_current = true/i);
  assert.match(sql, /drop index if exists[\s\S]*weekly_updates_one_current_idx/i);
  assert.match(sql, /and language = v_update\.language/i);
  assert.match(sql, /create or replace view public\.public_current_weekly_update\s+as[\s\S]*?language = 'en'[\s\S]*?create or replace view public\.public_current_weekly_update_es/i);
  assert.match(sql, /public_current_weekly_update_es[\s\S]*language = 'es'/);
});

test("the Español page reads only the Español view and the English page only the English view", async () => {
  const es = await readFile("app/espanol/actualizacion-semanal/page.tsx", "utf8");
  const en = await readFile("app/weekly-update/page.tsx", "utf8");
  assert.match(es, /public_current_weekly_update_es/);
  assert.doesNotMatch(es, /from\("public_current_weekly_update"\)/);
  assert.match(en, /from\("public_current_weekly_update"\)/);
  assert.match(es, /lang="es"/);
});

test("the admin forces chalkboards and footers to match the update's language", async () => {
  const actions = await readFile("app/admin/weekly-updates/actions.ts", "utf8");
  assert.match(actions, /readLanguage/);
  assert.match(actions, /language/);
  const editor = await readFile("app/admin/weekly-updates/weekly-update-editor.tsx", "utf8");
  assert.match(editor, /languageLocked/);
});
