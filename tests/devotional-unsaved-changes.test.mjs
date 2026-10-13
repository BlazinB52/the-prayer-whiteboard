import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile("app/admin/teachings/[id]/devotional/devotional-editor.tsx", "utf8");

// The behavior itself (badge flips on typing, clears on a confirmed save, survives a failed save) was
// checked by hand in a browser against the real forms. These tests keep the wiring from being undone.

test("both editor forms track unsaved changes through one shared helper", () => {
  assert.match(source, /function useUnsavedChanges</);
  assert.match(source, /useUnsavedChanges\(values, \{\s*title: devotional\.title/, "the series form uses it");
  assert.match(source, /useUnsavedChanges\(values, dayToValues\(day\), state\)/, "each day form uses it");
});

test("a day says 'Unsaved changes' while its text differs from what was saved", () => {
  assert.match(source, /hasUnsavedChanges\s*\?\s*<span[^>]*>Unsaved changes<\/span>/);
  assert.match(source, /isSaved \? "Saved" : "Not saved"/);
  assert.doesNotMatch(source, /\{day \? "Saved" : "Not saved"\}/, "the old badge that ignored edits is gone");
});

test("the green 'saved' messages disappear as soon as there are new edits", () => {
  assert.match(source, /state\.saved && !hasUnsavedChanges \? <p[^>]*>Day \{dayNumber\} saved\.<\/p>/);
  assert.match(source, /state\.saved && !hasUnsavedChanges \? <p[^>]*>Series information saved\.<\/p>/);
});

test("a reminder sits beside the Save button, where the person is looking", () => {
  assert.match(source, /You have unsaved changes\. Click Save Day \{dayNumber\} to keep them\./);
  assert.match(source, /You have unsaved changes\. Click Save Series Information to keep them\./);
});

test("the saved copy only moves forward when the server confirms a save", () => {
  // markSubmitted records what was sent; the saved copy is replaced only when state.saved arrives.
  assert.match(source, /if \(state\.saved && submitted && state !== handled\) \{\s*setHandled\(state\);\s*setSaved\(submitted\);/);
  assert.match(source, /onSubmit=\{markSubmitted\}/, "the series form records what it sends");
  const validation = source.indexOf("setClientError(null);");
  assert.ok(validation > -1 && source.indexOf("markSubmitted();", validation) > validation, "the day form records the send only after its own checks pass");
});

test("the browser warns before the page is closed or reloaded with unsaved changes", () => {
  assert.match(source, /addEventListener\("beforeunload", warn\)/);
  assert.match(source, /removeEventListener\("beforeunload", warn\)/);
  assert.match(source, /\}, \[hasUnsavedChanges\]\);/);
});
