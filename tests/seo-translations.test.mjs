import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { STATIC_TRANSLATIONS, buildPageMetadata, dayHeading, devotionalOverviewTitle, linkedTwinIds, otherLanguagePath, sitemapAlternates } from "../lib/alternates.ts";

test("every static pair lists English first and uses English as x-default", () => {
  const meta = buildPageMetadata({ title: "Privacy Policy", path: "/privacy", pair: STATIC_TRANSLATIONS.privacy });
  assert.deepEqual(meta.alternates.languages, { en: "/privacy", es: "/espanol/privacidad", "x-default": "/privacy" });
  const es = buildPageMetadata({ title: "Política de privacidad", path: "/espanol/privacidad", language: "es", pair: STATIC_TRANSLATIONS.privacy });
  assert.deepEqual(es.alternates.languages, meta.alternates.languages, "both pages in a pair must publish the same alternates");
});

test("og tags follow the page: own url, locale and alternate locale", () => {
  const es = buildPageMetadata({ title: "Hola", description: "Descripción", path: "/espanol", language: "es", pair: STATIC_TRANSLATIONS.home });
  assert.equal(es.openGraph.url, "/espanol");
  assert.equal(es.alternates.canonical, "/espanol");
  assert.equal(es.openGraph.locale, "es_SV");
  assert.deepEqual(es.openGraph.alternateLocale, ["en_US"]);
  assert.equal(es.openGraph.title, "Hola");
  assert.equal(es.openGraph.description, "Descripción");
  const en = buildPageMetadata({ title: { absolute: "Home" }, path: "/", pair: STATIC_TRANSLATIONS.home });
  assert.equal(en.openGraph.locale, "en_US");
  assert.deepEqual(en.openGraph.alternateLocale, ["es_SV"]);
  assert.equal(en.openGraph.title, "Home");
});

test("pages without a translation get no hreflang and no alternate locale", () => {
  const meta = buildPageMetadata({ title: "About", path: "/about" });
  assert.equal(meta.alternates.languages, undefined);
  assert.equal(meta.openGraph.alternateLocale, undefined);
});

test("noindex pages keep their own og:url", () => {
  const meta = buildPageMetadata({ title: "Email Preferences", path: "/email-preferences", noindex: true });
  assert.deepEqual(meta.robots, { index: false, follow: false });
  assert.equal(meta.openGraph.url, "/email-preferences");
});

test("the other-language link goes to the exact twin", () => {
  const pair = { en: "/teachings/a", es: "/teachings/b" };
  assert.equal(otherLanguagePath(pair, "es"), "/teachings/a");
  assert.equal(otherLanguagePath(pair, "en"), "/teachings/b");
  assert.equal(otherLanguagePath(null, "es"), null);
});

test("day titles don't repeat the day number the stored title already has", () => {
  assert.equal(dayHeading("Día 1", "Día 1: Cerrar el pasado que no dio fruto"), "Día 1: Cerrar el pasado que no dio fruto");
  assert.equal(dayHeading("Day 1", "Shuttering the Fruitless Past"), "Day 1: Shuttering the Fruitless Past");
  assert.equal(dayHeading("Day 2", "Day 2 - Rest"), "Day 2 - Rest");
});

test("overview titles don't repeat the devotional format label", () => {
  assert.equal(devotionalOverviewTitle("Devocional de 7 días: Cerrar el pasado", "Devocional de 7 días"), "Devocional de 7 días: Cerrar el pasado");
  assert.equal(devotionalOverviewTitle("Shuttering the Past and Moving Forward in Love", "7-Day Devotional"), "Shuttering the Past and Moving Forward in Love | 7-Day Devotional");
});

test("linked rows resolve to each other in both directions", () => {
  const twins = linkedTwinIds([{ id: "en", translation_of: null }, { id: "es", translation_of: "en" }, { id: "solo" }, { id: "orphan", translation_of: "gone" }]);
  assert.equal(twins.get("en"), "es");
  assert.equal(twins.get("es"), "en");
  assert.equal(twins.has("solo"), false);
  assert.equal(twins.has("orphan"), false);
});

test("sitemap alternates are absolute with English as x-default", () => {
  const alt = sitemapAlternates({ en: "/subscribe", es: "/espanol/suscribirse" }, (path) => `https://example.com${path}`);
  assert.deepEqual(alt.languages, { en: "https://example.com/subscribe", es: "https://example.com/espanol/suscribirse", "x-default": "https://example.com/subscribe" });
});

test("the sitemap lists the Español subscribe, privacy and copyright pages", async () => {
  const source = await readFile("app/sitemap.ts", "utf8");
  for (const path of ["/espanol/suscribirse", "/espanol/privacidad", "/espanol/derechos-de-autor"]) assert.ok(source.includes(`absoluteUrl("${path}")`), path);
});

test("html lang comes from the content language, not a hard-coded value or slug list", async () => {
  const [layout, language] = await Promise.all([readFile("app/layout.tsx", "utf8"), readFile("lib/page-language.ts", "utf8")]);
  assert.doesNotMatch(layout, /<html lang="en"/);
  assert.match(layout, /<html lang=\{language\}/);
  assert.match(language, /from\("teachings"\)\.select\("language"\)/);
  assert.doesNotMatch(language, /cerrar-el-pasado|devocional-de-7/);
});

test("Open devotional links use the canonical devotional address", async () => {
  const source = await readFile("lib/public-devotionals.ts", "utf8");
  assert.match(source, /return `\/devotionals\/\$\{series\.slug\}`;/);
  const list = await readFile("app/devotionals/page.tsx", "utf8");
  assert.doesNotMatch(list, /teachings\/\$\{series\.teaching\.slug\}\/devotional/);
});

test("the translation link migration is additive and one-to-one", async () => {
  const sql = await readFile("supabase/migrations/20261008000000_add_translation_links.sql", "utf8");
  assert.match(sql, /add column if not exists translation_of uuid references public\.teachings\(id\)/);
  assert.match(sql, /add column if not exists translation_of uuid references public\.teaching_devotionals\(id\)/);
  assert.match(sql, /create unique index if not exists teachings_translation_of_idx/);
  assert.doesNotMatch(sql, /drop table|delete from/i);
});
