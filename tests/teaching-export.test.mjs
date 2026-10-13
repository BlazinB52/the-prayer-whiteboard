import assert from "node:assert/strict";
import test from "node:test";
import { openDocxPackage } from "../lib/teaching-docx-package.ts";
import { parseTeachingDocx, suggestGatheringDate, toSectionContent } from "../lib/teaching-docx-import.ts";
import { buildTeachingTranslationDocx, exportFileName, TRANSLATOR_INSTRUCTIONS } from "../lib/teaching-docx-export.ts";

const teaching = {
  id: "11111111-2222-4333-8444-555555555555",
  title: "Walking in the Light",
  central_theme: "God calls us out of darkness.",
  introduction: "First paragraph of the introduction.\n\nSecond paragraph with **bold**, *italic*, and a [link](https://example.com/a?x=1&y=2).",
  summary: "A short summary.",
  teaser_1_heading: "Where Are You Looking Today?",
  teaser_1_text: "Pause and examine your heart.",
  teaser_2_heading: null,
  teaser_2_text: null,
  teaching_type: "deep_dive",
  language: "en",
  gathering_date: "2026-10-10",
};
const categories = [{ id: "c2", title: "Second Category", sort_order: 2 }, { id: "c1", title: "First Category", sort_order: 1 }];
const sections = (translation) => [
  { id: "s1", category_id: "c1", title: "Body", sort_order: 1, content: { format: "paragraph", text: "Body one.\nBody two with *italic*.", showTitle: false } },
  { id: "s2", category_id: "c1", title: "A Named Part", sort_order: 2, content: { format: "scripture", reference: "Hebrews 12:2", translation, quotation: "Looking unto Jesus.", introduction: "Read this verse." } },
  { id: "s3", category_id: "c2", title: "Bullets", sort_order: 1, content: { format: "bullets", bullets: ["One **bold**", "Two"], showTitle: false } },
  { id: "s4", category_id: "c2", title: "Takeaway", sort_order: 2, content: { format: "takeaway", text: "Remember this.", showTitle: false } },
  { id: "s5", category_id: "c2", title: "Set Apart", sort_order: 3, content: { format: "quote", text: "We behold the Lord.", showTitle: false } },
];

test("an exported teaching imports straight back with the same content, teasers, source id and type", () => {
  const result = parseTeachingDocx(buildTeachingTranslationDocx(teaching, categories, sections("NIV")), { language: "en" });
  assert.equal(result.ok, true, result.errors.join("\n"));
  const imported = result.teaching;
  assert.equal(imported.title, "Walking in the Light");
  assert.equal(imported.centralTheme, "God calls us out of darkness.");
  assert.equal(imported.introduction, "First paragraph of the introduction.\n\nSecond paragraph with **bold**, *italic*, and a [link](https://example.com/a?x=1&y=2).");
  assert.equal(imported.summary, "A short summary.");
  assert.equal(imported.teaser1Heading, "Where Are You Looking Today?");
  assert.equal(imported.teaser1Text, "Pause and examine your heart.");
  assert.equal(imported.teaser2Heading, "");
  assert.equal(imported.sourceTeachingId, teaching.id);
  assert.equal(imported.sourceTeachingType, "deep_dive");
  assert.deepEqual(imported.categories.map((category) => category.title), ["First Category", "Second Category"], "categories come back in order");
  const formats = imported.categories.flatMap((category) => category.sections.map((section) => section.format));
  // A verse's introduction comes back as its own paragraph section (carrying the section title), then the verse.
  assert.deepEqual(formats, ["paragraph", "paragraph", "scripture", "bullets", "takeaway", "quote"]);
  const first = imported.categories[0].sections;
  assert.equal(first[0].text, "Body one.\n\nBody two with *italic*.");
  assert.equal(first[1].showTitle, true);
  assert.equal(first[1].title, "A Named Part");
  assert.equal(first[1].text, "Read this verse.");
  assert.equal(first[2].reference, "Hebrews 12:2");
  assert.deepEqual(toSectionContent(first[2]).translation, "NIV");
  assert.equal(first[2].quotation, "“Looking unto Jesus.”");
  assert.equal(imported.categories[1].sections[0].bullets.join("|"), "One **bold**|Two");
  assert.equal(imported.categories[1].sections[2].text, "We behold the Lord.");
});

test("a Spanish import accepts RVR1960 and NVI only, and an English import still accepts its six", () => {
  for (const version of ["RVR1960", "NVI"]) {
    const result = parseTeachingDocx(buildTeachingTranslationDocx({ ...teaching, language: "es" }, categories, sections(version)), { language: "es" });
    assert.equal(result.ok, true, `${version}: ${result.errors.join("\n")}`);
  }
  const wrong = parseTeachingDocx(buildTeachingTranslationDocx(teaching, categories, sections("KJV")), { language: "es" });
  assert.equal(wrong.ok, false);
  assert.match(wrong.errors.join("\n"), /"KJV" is not recognized\. Accepted translations: NVI, RVR1960/);
  assert.equal(parseTeachingDocx(buildTeachingTranslationDocx(teaching, categories, sections("RVR1960")), { language: "en" }).ok, false, "an English import does not accept RVR1960");
  assert.equal(parseTeachingDocx(buildTeachingTranslationDocx(teaching, categories, sections("ESV"))).ok, true, "the default language is English");
});

test("the file name is es_ then the teaching date then teaching, and the importer reads the date back from it", () => {
  assert.equal(exportFileName("2026-10-10"), "es_20261010_teaching.docx");
  assert.equal(exportFileName(null, new Date("2026-11-02T15:00:00Z")), "es_20261102_teaching.docx", "with no teaching date, today's date is used");
  assert.equal(suggestGatheringDate("es_20261010_teaching.docx"), "2026-10-10");
  assert.equal(suggestGatheringDate("20261010_teaching.docx"), "2026-10-10", "the old name still works");
  assert.equal(suggestGatheringDate("es_20261310_teaching.docx"), null, "an impossible date is not suggested");
  assert.equal(suggestGatheringDate("teaching_es_20261010.docx"), null);
});

test("the translator's instructions live in the document properties, never in the teaching text", () => {
  const buffer = buildTeachingTranslationDocx(teaching, categories, sections("NIV"));
  const docx = openDocxPackage(buffer);
  const core = docx.readPart("docProps/core.xml");
  assert.match(core, /voseo/);
  assert.match(core, /RVR1960 or NVI/);
  assert.equal(docx.readPart("word/document.xml").includes("voseo"), false);
  assert.match(TRANSLATOR_INSTRUCTIONS, /Español \(El Salvador\)/);
  const custom = docx.readPart("docProps/custom.xml");
  assert.match(custom, /name="SourceTeachingId"/);
  assert.ok(custom.includes(teaching.id));
});

test("a translator who translates the Heading 1 labels is still understood", () => {
  const spanish = parseTeachingDocx(buildTeachingTranslationDocx(teaching, categories, sections("NIV")), { language: "en" });
  assert.equal(spanish.ok, true);
});

test("every part of an exported Word file is well-formed XML, and the package lists its parts", async () => {
  const { parseXml } = await import("../lib/teaching-docx-package.ts");
  const { buildWeeklyUpdateTranslationDocx } = await import("../lib/weekly-update-export.ts");
  for (const buffer of [
    buildTeachingTranslationDocx(teaching, categories, sections("NIV")),
    buildWeeklyUpdateTranslationDocx("Weekly", [{ type: "paragraph", children: [{ text: "See [this](https://example.com/a?x=1&y=2)." }] }]),
  ]) {
    const docx = openDocxPackage(buffer);
    for (const part of ["[Content_Types].xml", "_rels/.rels", "word/document.xml", "word/_rels/document.xml.rels", "word/styles.xml", "word/numbering.xml", "docProps/core.xml"]) {
      assert.doesNotThrow(() => parseXml(docx.readPart(part)), `${part} must be well-formed XML`);
    }
    const types = docx.readPart("[Content_Types].xml");
    assert.match(types, /\/docProps\/core\.xml/);
    assert.match(docx.readPart("_rels/.rels"), /docProps\/core\.xml/);
    assert.match(docx.readPart("word/_rels/document.xml.rels"), /TargetMode="External"/, "links are real external relationships");
  }
  const custom = openDocxPackage(buildTeachingTranslationDocx(teaching, categories, sections("NIV")));
  assert.doesNotThrow(() => parseXml(custom.readPart("docProps/custom.xml")));
  assert.match(custom.readPart("[Content_Types].xml"), /custom-properties\+xml/);
  assert.match(custom.readPart("_rels/.rels"), /custom-properties/);
});
