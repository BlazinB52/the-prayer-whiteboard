import assert from "node:assert/strict";
import test from "node:test";
import { buildCollectionReport } from "../lib/title-collections.ts";

const empty = { whiteboard: [], weeklyUpdate: [], handout: [], devotional: [], outline: [] };

test("a collection row is headed by the English teaching even when the two are linked the other way round", () => {
  const english = { id: "en", title: "Treasure in Jars of Clay", language: "en", status: "published", gathering_date: "2026-09-26", translation_of: "es" };
  const espanol = { id: "es", title: "Tesoro en Vasos de Barro", language: "es", status: "draft", gathering_date: "2026-09-26", translation_of: null };
  const report = buildCollectionReport({ teachings: [english, espanol], pieces: empty });
  assert.equal(report.rows.length, 1);
  assert.equal(report.rows[0].teaching.title, "Treasure in Jars of Clay");
});

test("a normally linked pair is still headed by the English teaching", () => {
  const english = { id: "en", title: "Treasure in Jars of Clay", language: "en", status: "published", gathering_date: "2026-09-26", translation_of: null };
  const espanol = { id: "es", title: "Tesoro en Vasos de Barro", language: "es", status: "draft", gathering_date: "2026-09-26", translation_of: "en" };
  const report = buildCollectionReport({ teachings: [espanol, english], pieces: empty });
  assert.equal(report.rows[0].teaching.title, "Treasure in Jars of Clay");
});

test("an Español teaching with no English one keeps its own title", () => {
  const espanol = { id: "es", title: "Tesoro en Vasos de Barro", language: "es", status: "draft", gathering_date: "2026-09-26", translation_of: null };
  const report = buildCollectionReport({ teachings: [espanol], pieces: empty });
  assert.equal(report.rows[0].teaching.title, "Tesoro en Vasos de Barro");
});
