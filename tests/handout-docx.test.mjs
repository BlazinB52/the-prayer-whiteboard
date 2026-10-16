import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildHandoutDocx, splitSections } from "../lib/handout-docx/build.ts";
import { extractHandout } from "../lib/handout-docx/extract.ts";
import { countLines, lineHeightPt, textWidthPt } from "../lib/handout-docx/measure.ts";
import { findTextBoxes } from "../lib/handout-docx/template.ts";
import { readZip, writeZip } from "../lib/handout-docx/zip.ts";

const read = (file) => readFile(file, "utf8");
const folder = "assets/handout-templates";
const template = (language) => readFileSync(`${folder}/handout-${language}.docx`);
const descriptor = (language) => JSON.parse(readFileSync(`${folder}/handout-${language}.json`, "utf8"));
// A 3 x 4 pixel PNG: the 3:4 shape the whiteboard library requires.
const PNG_3X4 = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAMAAAAEAQMAAACTPww9AAAAA1BMVEUAAACnej3aAAAAAXRSTlMAQObYZgAAAApJREFUCNdjYAAAAAIAAeIhvDMAAAAASUVORK5CYII=", "base64");
const PNG_SQUARE = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAD0lEQVR4nGNgYGD4z0AEAAAQAAH//2VoAAAAAElFTkSuQmCC", "base64");

const esFinished = () => extractHandout(template("es"), descriptor("es").sectionOrder);
const input = (language, overrides = {}) => {
  const finished = extractHandout(template(language), descriptor(language).sectionOrder);
  return {
    language,
    template: template(language),
    descriptor: descriptor(language),
    blocks: finished.blocks,
    whiteboard: { bytes: PNG_3X4, caption: "A short caption for the whiteboard.", altText: "A whiteboard" },
    leaveCaptionBlank: false,
    footerText: finished.footerParagraphs.join("\n\n"),
    ...overrides,
  };
};

// ---------------------------------------------------------------------------
// Measuring text
// ---------------------------------------------------------------------------

test("letters are measured with the Calibri widths the handout uses", () => {
  // Calibri "a" is 981 of 2048 units wide: 5.27 pt at 11 pt.
  assert.ok(Math.abs(textWidthPt("a", "calibri", 11) - 5.269) < 0.01);
  assert.ok(textWidthPt("a", "calibri", 11, true) > textWidthPt("a", "calibri", 11), "bold is wider");
  assert.ok(Math.abs(lineHeightPt("calibri", 11, 1.1) - 14.77) < 0.05, "an 11 pt line at Word's 1.1 spacing is about 14.8 pt");
});

test("lines break after a space, a hyphen or a dash, and a long word gets its own line", () => {
  const words = "palabra ".repeat(40);
  const lines = countLines([{ text: words }], "calibri", 11, 300, 300);
  assert.ok(lines > 2 && lines < 8);
  assert.equal(countLines([{ text: "uno" }], "calibri", 11, 300, 300), 1);
  assert.equal(countLines([{ text: "x".repeat(200) }], "calibri", 11, 100, 100), 1, "one unbreakable word is one line");
  // A hyphen is a break opportunity: the same width fits more when text can break there.
  const hyphenated = countLines([{ text: "ab-".repeat(60) }], "calibri", 11, 200, 200);
  assert.ok(hyphenated > 1);
});

test("a hanging indent makes the later lines narrower", () => {
  const runs = [{ text: "palabra ".repeat(30) }];
  assert.ok(countLines(runs, "calibri", 11, 300, 280) >= countLines(runs, "calibri", 11, 300, 300));
});

// ---------------------------------------------------------------------------
// The zip
// ---------------------------------------------------------------------------

test("a Word file's parts survive being read and written, pictures byte for byte", () => {
  const parts = readZip(template("es"));
  const again = readZip(writeZip(parts));
  assert.deepEqual([...again.keys()].sort(), [...parts.keys()].sort());
  for (const [name, data] of parts) assert.ok(again.get(name).equals(data), name);
});

// ---------------------------------------------------------------------------
// The templates
// ---------------------------------------------------------------------------

test("each template has three section boxes, a caption box and a footer box, and a descriptor that matches", () => {
  for (const language of ["es", "en"]) {
    const xml = readZip(template(language)).get("word/document.xml").toString("utf8");
    const boxes = findTextBoxes(xml);
    assert.equal(boxes.filter((box) => box.kind === "section").length, 3, language);
    assert.equal(boxes.filter((box) => box.kind === "caption").length, 1, language);
    assert.equal(boxes.filter((box) => box.kind === "footer").length, 1, language);
    const d = descriptor(language);
    assert.deepEqual(d.sectionOrder, [3, 2, 1]);
    assert.equal(d.capacityPt.length, 3);
  }
});

test("the Español template's text reads as three sections in order, with a caption and a footer", () => {
  const finished = esFinished();
  const { sections } = splitSections(finished.blocks);
  assert.equal(sections.length, 3);
  assert.deepEqual(sections.map((section) => section[0].inlines[0].text), ["DE GLORIA EN GLORIA", "LLEVANDO SU PRESENCIA", "VIVÍ CONSCIENTE DE SU PRESENCIA"]);
  assert.ok(finished.caption.length > 40);
  assert.equal(finished.footerParagraphs.length, 4);
  // A bold lead-in is kept as a bold lead-in.
  const bullets = sections[0].flatMap((block) => (block.type === "list" ? block.items : []));
  assert.equal(bullets[0].inlines[0].bold, true);
});

test("the English template differs from the Español one in the language pieces only", () => {
  const es = readZip(template("es"));
  const en = readZip(template("en"));
  const qr = (parts) => [...parts.keys()].find((name) => /media\/image1\./.test(name));
  assert.ok(!es.get(qr(es)).equals(en.get(qr(en))), "its own QR code");
  const xml = en.get("word/document.xml").toString("utf8");
  assert.match(xml, /Deepen your study\./);
  assert.match(xml, /Scan for teachings &amp; devotionals/);
  assert.doesNotMatch(xml, /Profundizá/);
  assert.match(xml, /w:lang w:val="en-US"/);
  assert.doesNotMatch(xml, /w:lang w:val="es-SV"/);
});

// ---------------------------------------------------------------------------
// Building
// ---------------------------------------------------------------------------

test("a handout builds from the Español template, and everything outside the text boxes is untouched", () => {
  const result = buildHandoutDocx(input("es"));
  assert.equal(result.ok, true, result.ok ? "" : result.errors.join("; "));
  const before = readZip(template("es"));
  const after = readZip(result.docx);

  const strip = (xml) => xml.replace(/<w:txbxContent>[\s\S]*?<\/w:txbxContent>/g, "<w:txbxContent/>").replace(/ descr="[^"]*"/g, "");
  assert.equal(strip(after.get("word/document.xml").toString("utf8")), strip(before.get("word/document.xml").toString("utf8")), "no box, picture or shape moved");
  for (const [name, data] of before) {
    if (["word/document.xml", "word/_rels/document.xml.rels"].includes(name) || /media\/image2/.test(name)) continue;
    assert.ok(after.get(name)?.equals(data), `${name} is unchanged`);
  }
  assert.ok(after.get("word/media/whiteboard.png").equals(PNG_3X4), "the whiteboard picture is the one given");
  assert.ok(![...after.keys()].some((name) => /image2/.test(name)), "the template's own picture is gone");
  assert.match(after.get("word/_rels/document.xml.rels").toString("utf8"), /Target="media\/whiteboard\.png"/);
  assert.match(after.get("word/document.xml").toString("utf8"), /descr="A whiteboard"/);
});

test("the sections' words come out exactly as given, in the template's formatting", () => {
  const finished = esFinished();
  const result = buildHandoutDocx(input("es"));
  assert.equal(result.ok, true);
  const xml = readZip(result.docx).get("word/document.xml").toString("utf8");
  for (const block of finished.blocks) {
    if (block.type === "section_title") assert.ok(xml.includes(block.inlines[0].text), block.inlines[0].text);
  }
  const text = [...xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((match) => match[1]).join("\n");
  assert.match(text, /Contemplá/);
  assert.match(text, /A short caption for the whiteboard\./);
  assert.match(text, /Reina-Valera/);
  // The title keeps the template's colour and size; paragraph titles keep theirs.
  assert.match(xml, /<w:color w:val="2455A4"\/>/);
  assert.match(xml, /<w:color w:val="946332"\/>/);
});

test("the report says how each section fit", () => {
  const result = buildHandoutDocx(input("es"));
  assert.equal(result.report.sections.length, 3);
  for (const section of result.report.sections) {
    assert.ok(section.usedPt <= section.capacityPt, `section ${section.section} fits`);
    assert.ok(section.sizePt >= 10, "never below 10 pt");
  }
  assert.ok(result.report.caption.lines <= result.report.caption.roomLines);
});

test("a section that does not fit stops the build and says which and by how much; nothing is cut", () => {
  const finished = esFinished();
  const blocks = structuredClone(finished.blocks);
  const index = blocks.findIndex((block) => block.type === "paragraph");
  blocks[index].inlines = [{ text: "Texto muy largo. ".repeat(80) }];
  const result = buildHandoutDocx(input("es", { blocks }));
  assert.equal(result.ok, false);
  assert.match(result.errors.join(" "), /Section \d \("[^"]+"\) does not fit its box: even at 10 pt .* too tall\. .*Nothing was cut\./);
});

test("text is tightened before it is shrunk, and never below 10 pt", () => {
  const finished = esFinished();
  const blocks = structuredClone(finished.blocks);
  // Make section 1's first paragraph a little longer so the full-size spacing no longer fits.
  const index = blocks.findIndex((block) => block.type === "paragraph");
  blocks[index].inlines[0].text += " Más palabras para llenar un poco la caja y obligar a ajustar el espacio.".repeat(2);
  const result = buildHandoutDocx(input("es", { blocks }));
  if (result.ok) for (const section of result.report.sections) assert.ok(section.sizePt >= 10);
  else assert.match(result.errors.join(" "), /10 pt/);
});

test("a handout with the wrong number of sections is refused", () => {
  const finished = esFinished();
  const blocks = finished.blocks.filter((block, index) => index < finished.blocks.length - 3);
  const result = buildHandoutDocx(input("es", { blocks: blocks.slice(0, 20) }));
  assert.equal(result.ok, false);
  assert.match(result.errors.join(" "), /section/);
});

test("the caption: too long stops, blank leaves a highlighted placeholder, missing warns", () => {
  const tooLong = buildHandoutDocx(input("es", { whiteboard: { bytes: PNG_3X4, caption: "Una leyenda muy larga. ".repeat(60), altText: null } }));
  assert.equal(tooLong.ok, false);
  assert.match(tooLong.errors.join(" "), /caption takes \d+ lines and the caption box has room for \d+/);

  const blank = buildHandoutDocx(input("es", { leaveCaptionBlank: true, whiteboard: { bytes: PNG_3X4, caption: "Una leyenda muy larga. ".repeat(60), altText: null } }));
  assert.equal(blank.ok, true);
  assert.equal(blank.report.caption.blank, true);
  const xml = readZip(blank.docx).get("word/document.xml").toString("utf8");
  assert.match(xml, /<w:highlight w:val="yellow"\/>/);
  assert.match(xml, /\[Escribí aquí el pie de foto\]/);

  const missing = buildHandoutDocx(input("es", { whiteboard: { bytes: PNG_3X4, caption: null, altText: null } }));
  assert.equal(missing.ok, true);
  assert.match(missing.report.warnings.join(" "), /no caption/);
});

test("the footer shrinks to fit, with a warning below 6 pt, and stops past 4 pt", () => {
  const long = "Texto del pie de página. ".repeat(80);
  const small = buildHandoutDocx(input("es", { footerText: long }));
  assert.equal(small.ok, true);
  assert.ok(small.report.footer.sizePt <= 6);
  assert.match(small.report.warnings.join(" "), /footer was set at/);

  const huge = buildHandoutDocx(input("es", { footerText: "Texto del pie de página. ".repeat(400) }));
  assert.equal(huge.ok, false);
  assert.match(huge.errors.join(" "), /footer does not fit its box even at 4 pt/);

  const none = buildHandoutDocx(input("es", { footerText: "" }));
  assert.equal(none.ok, false);
  assert.match(none.errors.join(" "), /no footer/);
});

test("the whiteboard image must be a PNG in the 3:4 shape", () => {
  const notPng = buildHandoutDocx(input("es", { whiteboard: { bytes: Buffer.from("not an image"), caption: "x", altText: null } }));
  assert.equal(notPng.ok, false);
  assert.match(notPng.errors.join(" "), /not a PNG/);
  const square = buildHandoutDocx(input("es", { whiteboard: { bytes: PNG_SQUARE, caption: "x", altText: null } }));
  assert.equal(square.ok, false);
  assert.match(square.errors.join(" "), /not the 3:4 shape/);
});

test("an English handout builds from the English template, in English", () => {
  const result = buildHandoutDocx(input("en"));
  assert.equal(result.ok, true, result.ok ? "" : result.errors.join("; "));
  const xml = readZip(result.docx).get("word/document.xml").toString("utf8");
  assert.match(xml, /Deepen your study\./);
  assert.match(xml, /w:lang w:val="en-US"/);
});

test("a file that is not a Word template is refused rather than thrown", () => {
  const result = buildHandoutDocx(input("es", { template: Buffer.from("not a zip") }));
  assert.equal(result.ok, false);
});

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

test("the build route is Administrator-only and needs the date, the teaching, the whiteboard and the footer", async () => {
  const route = await read("app/api/admin/handout/build/route.ts");
  assert.match(route, /is_authenticated_admin/);
  assert.match(route, /Enter the teaching date/);
  assert.match(route, /Choose the teaching/);
  assert.match(route, /Choose a footer/);
  assert.match(route, /has no \$\{language === "es" \? "Español" : "English"\} whiteboard assigned/);
  assert.match(route, /eq\("translation_of", handout\.teaching_id\)\.eq\("language", "es"\)/, "an Español handout takes the whiteboard of the Español teaching");
  assert.match(route, /publicationFileName\(String\(handout\.gathering_date\), language, handout\.version_label \? `handout_\$\{versionSlug\(String\(handout\.version_label\)\)\}` : "handout", "docx"\)/);
  assert.doesNotMatch(route, /\.(insert|update|delete)\(/, "building saves nothing");
});

test("the handout page offers the build once there is a draft, and the templates are shipped with the route", async () => {
  const page = await read("app/admin/handouts/[id]/page.tsx");
  assert.match(page, /<BuildHandoutSection/);
  assert.match(await read("next.config.ts"), /"\/api\/admin\/handout\/build": \["\.\/assets\/handout-templates\/\*\*\/\*"\]/);
});
