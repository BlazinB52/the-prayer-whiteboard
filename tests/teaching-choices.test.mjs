import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { offeredTeachingChoices, teachingChoiceLabel } from "../lib/teaching-choices.ts";

const teaching = (id, title, extra = {}) => ({ id, title, language: "en", gatheringDate: "2026-10-10", archived: false, ...extra });

test("each choice leads with the teaching date so similar titles can be told apart", () => {
  assert.equal(teachingChoiceLabel(teaching("a", "Aliyah: Israel, the Harvest & Prayer", { gatheringDate: "2026-09-26" })), "Sep 26, 2026 · Aliyah: Israel, the Harvest & Prayer");
  assert.equal(teachingChoiceLabel(teaching("b", "Aliyah: Israel, the Harvest, and Prayer", { gatheringDate: "2026-10-03" })), "Oct 3, 2026 · Aliyah: Israel, the Harvest, and Prayer");
  assert.equal(teachingChoiceLabel(teaching("c", "No date yet", { gatheringDate: null })), "No date yet");
});

test("only English teachings are offered, because everything is linked to the English teaching", () => {
  const all = [teaching("en1", "One"), teaching("es1", "Uno", { language: "es" }), teaching("old", "Old", { archived: true }), teaching("en2", "Two")];
  assert.deepEqual(offeredTeachingChoices(all).map((choice) => choice.id), ["en1", "en2"]);
});

test("a teaching that is already chosen stays in the list, so an existing link is never hidden", () => {
  const all = [teaching("en1", "One"), teaching("es1", "Uno", { language: "es" }), teaching("old", "Old", { archived: true })];
  assert.deepEqual(offeredTeachingChoices(all, "es1").map((choice) => choice.id), ["en1", "es1"]);
  assert.deepEqual(offeredTeachingChoices(all, "old").map((choice) => choice.id), ["en1", "old"]);
  assert.equal(teachingChoiceLabel(all[1]), "Oct 10, 2026 · Uno (Español)");
});

test("the handout and weekly update pickers keep the current choice selectable", async () => {
  assert.match(await readFile("app/admin/handouts/handout-tools.tsx", "utf8"), /<TeachingChoiceOptions teachings=\{teachings\} selectedId=\{teachingId\} \/>/);
  assert.match(await readFile("app/admin/weekly-updates/weekly-update-editor.tsx", "utf8"), /<TeachingChoiceOptions teachings=\{teachings\} selectedId=\{initialTeachingId\} \/>/);
});
