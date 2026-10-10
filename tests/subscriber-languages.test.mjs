import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { categoryLabels } from "../lib/subscription-confirmation-view.ts";
import { offeredEmailCategories } from "../lib/email-categories.ts";
import { languagesFromCheckboxes, languagesFromScope, normalizeLanguages, sameLanguages } from "../lib/subscriber-languages.ts";
import { getManagedSenderGroupIds, getSenderGroupIdsForSubscription } from "../lib/devotional-sender-groups.ts";
import { reconcileSenderSubscriberGroups } from "../lib/sender-subscriber-groups-core.ts";

test("every send reads only subscribers who chose that language, English by default", async () => {
  const source = await readFile("lib/broadcast-recipients.ts", "utf8");
  assert.match(source, /language: "en" \| "es" = "en"/);
  assert.match(source, /normalizeLanguages\(subscriber\?\.languages\)/);
  assert.match(source, /chosen\.includes\(language\)/);
  assert.match(source, /export function assertRecipientsChoseLanguage/);
  // Devotionals are English-only for now: they ask for a category only and must never mail Español subscribers.
  const devotional = await readFile("lib/devotional-send.ts", "utf8");
  assert.match(devotional, /loadConfirmedRecipients\("devotionals"\)/, "devotionals must keep mailing English subscribers only");
  assert.doesNotMatch(devotional, /loadConfirmedRecipients\([^)]*"es"/, "devotionals must not mail Español subscribers yet");
  // A weekly update is mailed in its own language, taken from the update row and never hard-coded.
  const weekly = await readFile("lib/weekly-update-broadcast.ts", "utf8");
  assert.match(weekly, /const language = update\.language;/);
  assert.match(weekly, /loadConfirmedRecipients\("weekly_updates", language\)/);
  assert.doesNotMatch(weekly, /loadConfirmedRecipients\([^)]*"(?:en|es)"/, "the language must come from the update, never be hard-coded");
  // A teaching is mailed in its own language, to the subscribers who chose that language and nobody else.
  const teaching = await readFile("lib/teaching-broadcast.ts", "utf8");
  assert.match(teaching, /const language = teaching\.language;/);
  assert.match(teaching, /loadConfirmedRecipients\("teachings", language\)/);
  assert.doesNotMatch(teaching, /loadConfirmedRecipients\([^)]*"(?:en|es)"/, "the language must come from the teaching, never be hard-coded");
});

test("English and Español subscriber lists never mix: each send reaches only people who chose that language", () => {
  const reaches = (languages, sendLanguage) => normalizeLanguages(languages).includes(sendLanguage);

  // Chose English only
  assert.equal(reaches(["en"], "en"), true);
  assert.equal(reaches(["en"], "es"), false);
  // Chose Español only
  assert.equal(reaches(["es"], "es"), true);
  assert.equal(reaches(["es"], "en"), false);
  // Chose both: gets each language's emails
  assert.equal(reaches(["en", "es"], "en"), true);
  assert.equal(reaches(["en", "es"], "es"), true);
  // No recorded choice (older subscribers) counts as English only, so Spanish never reaches them
  assert.equal(reaches(null, "en"), true);
  assert.equal(reaches(null, "es"), false);
  assert.equal(reaches([], "es"), false);
});

test("both cards offer the same three choices", () => {
  assert.deepEqual([...offeredEmailCategories("es")], ["weekly_updates", "teachings", "devotionals"]);
  assert.deepEqual([...offeredEmailCategories("en")], ["weekly_updates", "teachings", "devotionals"]);
  assert.deepEqual(categoryLabels(["weekly_updates", "teachings", "devotionals"], "es"), ["Actualizaciones semanales", "Nuevas enseñanzas", "Devocionales de 7 días"]);
});

test("the language helpers read the forms and keep a valid, ordered, non-empty list", () => {
  assert.deepEqual(languagesFromScope("own", "en"), ["en"]);
  assert.deepEqual(languagesFromScope("own", "es"), ["es"]);
  assert.deepEqual(languagesFromScope("both", "es"), ["en", "es"]);
  assert.deepEqual(languagesFromScope("anything else", "es"), ["es"]);
  assert.deepEqual(normalizeLanguages(["es", "en", "es", "fr"]), ["en", "es"]);
  assert.deepEqual(normalizeLanguages([]), ["en"]);
  assert.deepEqual(normalizeLanguages(null), ["en"]);
  assert.equal(sameLanguages(["es", "en"], ["en", "es"]), true);
  assert.equal(sameLanguages(["en"], ["en", "es"]), false);
  const form = new FormData();
  form.set("language_es", "on");
  assert.deepEqual(languagesFromCheckboxes(form), ["es"]);
  form.set("language_en", "on");
  assert.deepEqual(languagesFromCheckboxes(form), ["en", "es"]);
});

test("Sender groups follow the language(s) and categories a subscriber chose", () => {
  Object.assign(process.env, {
    SENDER_WEEKLY_UPDATES_GROUP_ID: "enUpd",
    SENDER_TEACHINGS_GROUP_ID: "enTch",
    SENDER_DEVOTIONAL_MASTER_GROUP_ID: "enDev",
    SENDER_DEVOTIONAL_SERIES_GROUP_IDS: "beyond-the-garden:enSeries",
    SENDER_ES_WEEKLY_UPDATES_GROUP_ID: "esUpd",
    SENDER_ES_TEACHINGS_GROUP_ID: "esTch",
    SENDER_ES_DEVOTIONALS_GROUP_ID: "esDev",
  });
  const all = ["weekly_updates", "teachings", "devotionals"];
  // English only: English groups, never an Español one.
  assert.deepEqual(getSenderGroupIdsForSubscription(["en"], all, "beyond-the-garden"), ["enUpd", "enTch", "enDev", "enSeries"]);
  // Español only: Español groups, never an English one.
  assert.deepEqual(getSenderGroupIdsForSubscription(["es"], all), ["esUpd", "esTch", "esDev"]);
  // Both: the matching group in each language.
  assert.deepEqual(getSenderGroupIdsForSubscription(["en", "es"], ["teachings"]), ["enTch", "esTch"]);
  // Only the categories they picked.
  assert.deepEqual(getSenderGroupIdsForSubscription(["es"], ["devotionals"]), ["esDev"]);
  assert.deepEqual(getSenderGroupIdsForSubscription(["en", "es"], []), []);
  const managed = getManagedSenderGroupIds();
  assert.deepEqual([...managed.fixed].sort(), ["enDev", "enTch", "enUpd", "esDev", "esTch", "esUpd"]);
  assert.deepEqual(managed.series, ["enSeries"]);
});

function fakeSender(tags) {
  const calls = [];
  const fetcher = async (url, init = {}) => {
    const method = init.method ?? "GET";
    const body = init.body ? JSON.parse(String(init.body)) : null;
    calls.push({ method, url: String(url), body });
    if (method === "GET") {
      return tags ? new Response(JSON.stringify({ data: { id: "s1", subscriber_tags: tags } }), { status: 200 }) : new Response("{}", { status: 404 });
    }
    return new Response(JSON.stringify({ data: { id: "s1" } }), { status: 200 });
  };
  return { calls, fetcher };
}
const base = { apiKey: "k", email: "Reader@Example.test", firstName: "Reader", managedGroupIds: ["enUpd", "enTch", "enDev", "esUpd", "esTch", "esDev"] };
const path = (call) => call.method + " " + call.url.replace("https://api.sender.net/v2", "");

test("Sender: one record gets the groups it is missing and loses the ones it should not have", async () => {
  // In the English teachings group today; now wants Español teachings only.
  const { calls, fetcher } = fakeSender([{ id: "enTch" }, { id: "someUnmanagedGroup" }]);
  const result = await reconcileSenderSubscriberGroups({ ...base, desiredGroupIds: ["esTch"], fetcher });
  assert.deepEqual(result, { ok: true, subscriberId: "s1", added: ["esTch"], removed: ["enTch"] });
  assert.deepEqual(calls.map(path), [
    "GET /subscribers/reader%40example.test",
    "POST /subscribers/groups/esTch",
    "DELETE /subscribers/groups/enTch",
  ]);
  assert.deepEqual(calls[2].body, { subscribers: ["reader@example.test"], trigger_automation: false });
  // A group the app does not manage is never touched.
  assert.equal(calls.some((call) => call.url.includes("someUnmanagedGroup")), false);
});

test("Sender: nothing changes when the groups already match", async () => {
  const { calls, fetcher } = fakeSender([{ id: "enTch" }, { id: "esTch" }]);
  const result = await reconcileSenderSubscriberGroups({ ...base, desiredGroupIds: ["enTch", "esTch"], fetcher });
  assert.deepEqual(result, { ok: true, subscriberId: "s1", added: [], removed: [] });
  assert.equal(calls.length, 1);
});

test("Sender: unsubscribing removes the subscriber from every managed group", async () => {
  const { calls, fetcher } = fakeSender([{ id: "enUpd" }, { id: "esDev" }, { id: "other" }]);
  const result = await reconcileSenderSubscriberGroups({ ...base, desiredGroupIds: [], fetcher });
  assert.deepEqual([...result.removed].sort(), ["enUpd", "esDev"]);
  assert.equal(calls.filter((call) => call.method === "POST").length, 0);
});

test("Sender: a new subscriber is created once, with all of their groups", async () => {
  const { calls, fetcher } = fakeSender(null);
  const result = await reconcileSenderSubscriberGroups({ ...base, desiredGroupIds: ["enTch", "esTch"], fetcher });
  assert.equal(result.ok, true);
  assert.equal(calls.filter((call) => call.method === "POST").length, 1);
  assert.deepEqual(calls[1].body.groups, ["enTch", "esTch"]);
});

test("Sender: an address that is not in Sender is not created just to remove it", async () => {
  const { calls, fetcher } = fakeSender(null);
  const result = await reconcileSenderSubscriberGroups({ ...base, desiredGroupIds: [], fetcher });
  assert.deepEqual(result, { ok: true, subscriberId: null, added: [], removed: [] });
  assert.equal(calls.length, 1);
});

test("a different language choice needs a confirmation click before it takes effect", async () => {
  const source = await readFile("lib/email-subscriptions.ts", "utf8");
  const branch = source.match(/if \(existing && existingIsConfirmed && !sameLanguages\(existing\.languages, fields\.value\.languages\)\)[\s\S]*?\n  }\n/)?.[0] ?? "";
  assert.notEqual(branch, "", "the language-change branch must exist");
  // The request is parked in pending_languages and the confirmation goes out in the form's language...
  assert.match(branch, /deliverConfirmationEmail\(/);
  assert.match(branch, /language,\n/);
  // ...and nothing about the live subscription changes until the token is used.
  assert.equal((branch.match(/\.update\(/g) ?? []).length, 1, "the branch may only record the pending request");
  assert.match(branch, /\.update\(\{ pending_languages: fields\.value\.languages \}\)/);
  assert.doesNotMatch(branch, /replacePreferences|syncConfirmedSubscriber/);
  assert.match(source, /languages: nextLanguages,\n\s+pending_language: null,\n\s+pending_languages: null,/);
});

test("saving preferences stores the languages and then rebuilds the Sender groups, including on unsubscribe", async () => {
  const source = await readFile("lib/email-subscriptions.ts", "utf8");
  const save = source.match(/export async function savePreferences[\s\S]*?\n}\n/)?.[0] ?? "";
  assert.match(save, /languages,\n\s+pending_language: null,\n\s+pending_languages: null,/);
  assert.match(save, /await syncConfirmedSubscriber\(\{ subscriberId: tokenResult\.subscriberId \}\)/);
  assert.ok(save.indexOf("replacePreferences") < save.indexOf("syncConfirmedSubscriber"), "groups are rebuilt after the choices are stored");
  const sync = source.match(/async function syncConfirmedSubscriber[\s\S]*?\n}\n/)?.[0] ?? "";
  assert.match(sync, /const groupIds = confirmed \?/, "only a confirmed subscriber can be in any group");
});

test("both signup forms and both preferences pages let the subscriber choose their language(s)", async () => {
  for (const file of ["app/subscribe/subscribe-form.tsx", "app/espanol/suscribirse/subscribe-form-es.tsx"]) {
    const source = await readFile(file, "utf8");
    assert.match(source, /name="languageScope" type="radio" value="own" defaultChecked/);
    assert.match(source, /name="languageScope" type="radio" value="both"/);
  }
  for (const file of ["app/email-preferences/manage/preference-management-form.tsx", "app/espanol/preferencias/administrar/preference-management-form-es.tsx"]) {
    const source = await readFile(file, "utf8");
    assert.match(source, /name="language_en" type="checkbox"/);
    assert.match(source, /name="language_es" type="checkbox"/);
  }
});
