import assert from "node:assert/strict";
import test from "node:test";
import { getDevotionalSenderGroupIds } from "../lib/devotional-sender-groups.ts";
import { syncSenderSubscriberGroups } from "../lib/sender-subscriber-groups-core.ts";

test("devotional slugs map to the master and correct series groups", () => {
  process.env.SENDER_DEVOTIONAL_MASTER_GROUP_ID = "bo98N3";
  process.env.SENDER_DEVOTIONAL_SERIES_GROUP_IDS = "aliyah-israel-the-harvest-and-prayer:bmVQgn,beyond-the-garden:e30QBQ,5787-the-year-of-the-spoken-word-and-divine-rest:bWzpxx";

  assert.deepEqual(getDevotionalSenderGroupIds("aliyah-israel-the-harvest-and-prayer"), ["bo98N3", "bmVQgn"]);
  assert.deepEqual(getDevotionalSenderGroupIds("beyond-the-garden"), ["bo98N3", "e30QBQ"]);
  assert.deepEqual(getDevotionalSenderGroupIds("5787-the-year-of-the-spoken-word-and-divine-rest"), ["bo98N3", "bWzpxx"]);
  assert.deepEqual(getDevotionalSenderGroupIds("invalid-slug"), ["bo98N3"]);
  assert.deepEqual(getDevotionalSenderGroupIds(), ["bo98N3"]);
});

test("devotional group ids are absent when the environment is unconfigured", () => {
  delete process.env.SENDER_DEVOTIONAL_MASTER_GROUP_ID;
  delete process.env.SENDER_DEVOTIONAL_SERIES_GROUP_IDS;

  assert.deepEqual(getDevotionalSenderGroupIds("beyond-the-garden"), []);
});

test("new Sender subscribers are created with all groups and automation enabled", async () => {
  const requests = [];
  const result = await syncSenderSubscriberGroups({
    apiKey: "test-key",
    email: "Reader@Example.test",
    firstName: "Reader",
    groupIds: ["bo98N3", "bWzpxx"],
    fetcher: async (url, init) => {
      requests.push({ url: String(url), method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : null });
      if ((init?.method ?? "GET") === "GET") return new Response("{}", { status: 404 });
      return new Response(JSON.stringify({ data: { id: "sender-123" } }), { status: 201 });
    },
  });

  assert.deepEqual(result, { ok: true, subscriberId: "sender-123" });
  assert.deepEqual(requests[1], {
    url: "https://api.sender.net/v2/subscribers",
    method: "POST",
    body: {
      email: "reader@example.test",
      firstname: "Reader",
      groups: ["bo98N3", "bWzpxx"],
      trigger_automation: true,
    },
  });
});

test("existing Sender subscribers are added to each group with automation enabled", async () => {
  const requests = [];
  const result = await syncSenderSubscriberGroups({
    apiKey: "test-key",
    email: "reader@example.test",
    firstName: "Reader",
    groupIds: ["bo98N3", "bWzpxx"],
    fetcher: async (url, init) => {
      requests.push({ url: String(url), method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : null });
      if ((init?.method ?? "GET") === "GET") return new Response(JSON.stringify({ data: { id: "sender-123" } }), { status: 200 });
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    },
  });

  assert.deepEqual(result, { ok: true, subscriberId: "sender-123" });
  assert.deepEqual(requests.slice(1), ["bo98N3", "bWzpxx"].map((groupId) => ({
    url: `https://api.sender.net/v2/subscribers/groups/${groupId}`,
    method: "POST",
    body: { subscribers: ["reader@example.test"], trigger_automation: true },
  })));
});

test("Sender group failures are returned without throwing", async () => {
  const result = await syncSenderSubscriberGroups({
    apiKey: "test-key",
    email: "reader@example.test",
    firstName: "Reader",
    groupIds: ["bo98N3"],
    fetcher: async (_url, init) => (init?.method ?? "GET") === "GET"
      ? new Response(JSON.stringify({ data: { id: "sender-123" } }), { status: 200 })
      : new Response(JSON.stringify({ message: "rejected" }), { status: 422 }),
  });
  assert.deepEqual(result, { ok: false, error: "Sender subscriber sync failed with status 422." });
});
