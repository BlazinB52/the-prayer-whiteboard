import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const actions = await readFile("app/admin/devotionals/actions.ts", "utf8");
const page = await readFile("app/admin/devotionals/new/page.tsx", "utf8");
const form = await readFile("app/admin/devotionals/new/create-standalone-devotional-form.tsx", "utf8");

function body(source, name) {
  const start = source.indexOf(`export async function ${name}`);
  assert.ok(start > -1, `${name} exists`);
  const next = source.indexOf("\nexport async function ", start + 10);
  return source.slice(start, next === -1 ? undefined : next);
}

test("the New Devotional page leads with the language and the text file, not a title and description", () => {
  assert.match(page, /<CreateDevotionalFromFileForm action=\{createStandaloneDevotionalFromFile\} \/>/);
  assert.ok(page.indexOf("CreateDevotionalFromFileForm action") < page.indexOf("CreateStandaloneDevotionalForm action"), "the file form comes first");
  assert.match(page, /Create From a Text File/);

  const fileForm = form.slice(form.indexOf("export function CreateDevotionalFromFileForm"));
  assert.match(fileForm, /name="language"/);
  assert.match(fileForm, /name="devotionalFile" type="file" accept="\.txt,text\/plain" required/);
  assert.doesNotMatch(fileForm, /name="title"|name="introduction"/, "nothing is typed twice");
});

test("writing a devotional by hand is still possible, tucked under the file form", () => {
  assert.match(page, /<details[^>]*>[\s\S]*No file yet\?[\s\S]*<CreateStandaloneDevotionalForm action=\{createStandaloneDevotional\} \/>[\s\S]*<\/details>/);
  assert.match(body(actions, "createStandaloneDevotional"), /insertStandaloneDraft\(/);
});

test("creating from a file reads the title, introduction and seven days from the file as a draft", () => {
  const action = body(actions, "createStandaloneDevotionalFromFile");
  assert.match(action, /await requireAdmin\(\)/, "admins only");
  assert.match(action, /readImportedDevotionalFile\(formData\)/);
  assert.match(action, /title: imported\.title, introduction: imported\.introduction \|\| null/);
  assert.match(action, /imported\.days\.map\(\(day\) => importedDayRow\(created\.id, day\)\)/);
  assert.match(action, /redirect\(`\/admin\/devotionals\/\$\{created\.id\}\?imported=1`\)/);
  assert.doesNotMatch(action, /status: "published"/, "it is created as a draft");
});

test("a file in the other language than the one chosen is refused before anything is created", () => {
  const action = body(actions, "createStandaloneDevotionalFromFile");
  const mismatch = action.indexOf("imported.language !== language");
  const insert = action.indexOf("insertStandaloneDraft(");
  assert.ok(mismatch > -1 && mismatch < insert, "the language is checked before the devotional is inserted");
  assert.match(action, /You chose Español, but this file is written in English/);
  assert.match(action, /You chose English, but this file is written in Español/);
});

test("an empty draft is not left behind when the days cannot be saved", () => {
  const action = body(actions, "createStandaloneDevotionalFromFile");
  assert.match(action, /if \(daysError\) \{[\s\S]*\.from\("teaching_devotionals"\)\.delete\(\)\.eq\("id", created\.id\)/);
});

test("both ways of creating a devotional share one slug routine", () => {
  const helper = actions.slice(actions.indexOf("async function insertStandaloneDraft"));
  assert.match(helper, /error\?\.code !== "23505"/, "a duplicate title retries with a numbered slug");
  assert.match(helper, /teaching_id: null/, "it belongs to no teaching");
  assert.match(helper, /status: "draft"/);
});
