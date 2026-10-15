// Makes the two handout templates the builder uses, from the finished handouts they are based on.
//
//   Español: the finished Español handout, as it is.
//   English: the same file with the three things that differ by language swapped for the English ones: the "Deepen your
//            study" lines, the QR code, and the footer text. The text of the sections is the English handout's.
//
// Usage: node scripts/make-handout-templates.mjs <es-finished.docx> <en-finished.docx> <en-draft-text.docx> <out-dir>
// The room each section box has (capacityPt) is measured on the finished Español handout; slackPt is the room left under
// the text on its printed page, read from a picture of the printed page.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { buildHandoutDocx, measureFinishedHandout } from "../lib/handout-docx/build.ts";
import { extractHandout } from "../lib/handout-docx/extract.ts";
import { findTextBoxes, EMU_PER_INCH } from "../lib/handout-docx/template.ts";
import { readZip, writeZip } from "../lib/handout-docx/zip.ts";
import { parseHandoutDocx } from "../lib/teaching-handouts.ts";

const require = createRequire(import.meta.url);
const sharp = require("sharp");

const [, , esPath, enPath, draftPath, outDir] = process.argv;
mkdirSync(outDir, { recursive: true });

const SECTION_ORDER = [3, 2, 1];
const SLACK_PT = [10.8, 10.8, 0.7];
const esDocx = readFileSync(esPath);
const capacityPt = measureFinishedHandout(esDocx, SLACK_PT);
const descriptor = { sectionOrder: SECTION_ORDER, capacityPt };

// --- Español: the finished handout itself ----------------------------------------------------------------------------
copyFileSync(esPath, `${outDir}/handout-es.docx`);
writeFileSync(`${outDir}/handout-es.json`, JSON.stringify(descriptor, null, 2) + "\n");

// --- English: swap the language-specific pieces -------------------------------------------------------------------
const enParts = readZip(readFileSync(enPath));
const enFinished = extractHandout(readFileSync(enPath), SECTION_ORDER);

const parts = readZip(esDocx);
const relsText = parts.get("word/_rels/document.xml.rels").toString("utf8");
const target = (id) => relsText.match(new RegExp(`Id="${id}"[^>]*Target="([^"]+)"`))?.[1] ?? relsText.match(new RegExp(`Target="([^"]+)"[^>]*Id="${id}"`))?.[1];

// The QR code: the English one, in the slot the Español one has.
const enRels = enParts.get("word/_rels/document.xml.rels").toString("utf8");
const enQrTarget = enRels.match(/Id="rId8"[^>]*Target="([^"]+)"/)?.[1];
const qrTarget = target("rId8");
if (!enQrTarget || !qrTarget) throw new Error("Could not find the QR code in one of the handouts.");
parts.set(`word/${qrTarget}`, enParts.get(`word/${enQrTarget}`));

// The "Deepen your study" lines.
let xml = parts.get("word/document.xml").toString("utf8");
const boxes = findTextBoxes(xml);
const qrBlock = boxes.find((box) => box.kind === "other" && Math.abs(box.widthEmu / EMU_PER_INCH - 2.95) < 0.08);
if (!qrBlock) throw new Error("Could not find the QR block in the Español handout.");
const first = qrBlock.paragraphs[0];
const runRPr = first.match(/<w:r\b[\s\S]*?(<w:rPr>[\s\S]*?<\/w:rPr>)/)[1];
const pPr = first.match(/<w:pPr>[\s\S]*?<\/w:pPr>/)[0].replace(/w:val="es-SV"/g, 'w:val="en-US"');
const rPr = runRPr.replace(/w:val="es-SV"/g, 'w:val="en-US"');
const line = (text) => `<w:r>${rPr}<w:t xml:space="preserve">${text}</w:t></w:r>`;
const paragraph = `<w:p>${pPr}${line("Deepen your study.")}<w:r>${rPr}<w:br/></w:r>${line("Scan for teachings &amp; devotionals")}</w:p>`;
const rest = qrBlock.paragraphs.slice(1).join("");
for (const range of [...qrBlock.ranges].sort((a, b) => b.start - a.start)) xml = xml.slice(0, range.start) + paragraph + rest + xml.slice(range.end);
parts.set("word/document.xml", Buffer.from(xml, "utf8"));

// The sample whiteboard: the English handout's, as the picture the Español one is.
const picTarget = target("rId9");
const enPicTarget = enRels.match(/Id="rId9"[^>]*Target="([^"]+)"/)?.[1];
parts.set(`word/${picTarget}`, enParts.get(`word/${enPicTarget}`));
const swapped = writeZip(parts);

// Build the English template: the English sections and caption, the English footer, and the sample whiteboard.
const draft = parseHandoutDocx(readFileSync(draftPath));
if (!draft.ok) throw new Error(`The English draft text could not be read: ${draft.errors.join(" ")}`);
const whiteboard = await sharp(enParts.get(`word/${enPicTarget}`)).resize(1080, 1440, { fit: "fill" }).png().toBuffer();
const built = buildHandoutDocx({
  language: "en",
  template: swapped,
  descriptor,
  blocks: draft.handout.blocks,
  whiteboard: { bytes: whiteboard, caption: enFinished.caption, altText: null },
  leaveCaptionBlank: false,
  footerText: enFinished.footerParagraphs.join("\n\n"),
});
console.log(JSON.stringify(built.report, null, 1));
if (!built.ok) {
  console.error("ERRORS:", built.errors);
  process.exit(1);
}
writeFileSync(`${outDir}/handout-en.docx`, built.docx);
writeFileSync(`${outDir}/handout-en.json`, JSON.stringify(descriptor, null, 2) + "\n");
console.log("wrote handout-es.docx, handout-en.docx and their descriptors to", outDir);
