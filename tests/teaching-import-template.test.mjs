import test from "node:test";
import assert from "node:assert/strict";
import { parseTeachingDocx } from "../lib/teaching-docx-import.ts";
import { openDocxPackage, parseXml } from "../lib/teaching-docx-package.ts";
import { buildTeachingTemplate } from "../scripts/build-teaching-import-template.mjs";

test("the companion Word template is well-formed and passes the teaching importer", () => {
  const buffer = buildTeachingTemplate();
  const docx = openDocxPackage(buffer);
  for (const part of ["word/document.xml", "word/styles.xml", "word/numbering.xml", "[Content_Types].xml", "word/_rels/document.xml.rels"]) {
    assert.doesNotThrow(() => parseXml(docx.readPart(part)), `${part} must be well-formed XML`);
  }

  const result = parseTeachingDocx(buffer);
  assert.equal(result.ok, true, result.errors.join("\n"));
  assert.deepEqual(result.warnings, []);
  assert.equal(result.teaching.categories.length, 2);
  const formats = result.teaching.categories.flatMap((category) => category.sections.map((section) => section.format));
  assert.deepEqual([...new Set(formats)].sort(), ["bullets", "paragraph", "scripture", "takeaway"]);
});

test("the template installs the exact style names and IDs the import rules list", () => {
  const styles = openDocxPackage(buildTeachingTemplate()).readPart("word/styles.xml");
  for (const [id, name] of [["Title", "Title"], ["Heading1", "heading 1"], ["Heading2", "heading 2"], ["Normal", "Normal"], ["ScriptureQuote", "Scripture Quote"], ["ListBullet", "List Bullet"], ["Takeaway", "Takeaway"]]) {
    assert.ok(styles.includes(`w:styleId="${id}"><w:name w:val="${name}"/>`), `missing style ${name} [${id}]`);
  }
  assert.equal(styles.includes("Subtitle"), false, "the template must not offer the Subtitle style");
  assert.equal(styles.includes('w:styleId="Callout"'), false, "the template must not offer the unsupported Callout style");
});
