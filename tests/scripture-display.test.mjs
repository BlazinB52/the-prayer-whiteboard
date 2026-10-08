import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const files = [
  "app/teachings/[slug]/page.tsx",
  "app/admin/teachings/callout-utils.tsx",
  "app/admin/teachings/content-workspace.tsx",
];

test("a scripture shows a bold reference with its translation, then the verse as an upright quote with a gray bar", async () => {
  for (const file of files) {
    const source = await readFile(file, "utf8");
    assert.match(source, /text-lg font-extrabold text-\[#243126\]/, `${file}: the reference line is bold`);
    assert.match(source, /<blockquote className="mt-3 border-l-4 border-\[#d9d9d9\] pl-6 text-lg leading-8 text-\[#243126\]">/, `${file}: the verse sits in a quote with a left bar`);
    assert.doesNotMatch(source, /mt-2 space-y-3 italic|mt-2 italic/, `${file}: the verse is no longer italic`);
    assert.doesNotMatch(source, /font-normal text-\[#607066\]">\(<ScriptureTranslationLabel/, `${file}: the translation is no longer a small gray label`);
  }
});
