// A development check for the handout builder: builds a handout from a finished handout's own text and prints how it fits.
// Usage: node scripts/handout-docx-try.mjs <finished-handout.docx> <out.docx>
import { readFileSync, writeFileSync } from "node:fs";
import { buildHandoutDocx, measureFinishedHandout } from "../lib/handout-docx/build.ts";
import { extractHandout } from "../lib/handout-docx/extract.ts";

const [, , input, output] = process.argv;
const template = readFileSync(input);
const sectionOrder = [3, 2, 1];
// Room left under the text of the finished handout, in points, read from its printed page (box 1, 2, 3 in the file).
const slackPt = [10.8, 10.8, 0.7];
const capacityPt = measureFinishedHandout(template, slackPt);
console.log("capacities (pt):", capacityPt);

const finished = extractHandout(template, sectionOrder);
console.log("blocks:", finished.blocks.length, "| caption:", finished.caption.slice(0, 60), "| footer paragraphs:", finished.footerParagraphs.length);

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAMAAAAEAQMAAACTPww9AAAAA1BMVEUAAACnej3aAAAAAXRSTlMAQObYZgAAAApJREFUCNdjYAAAAAIAAeIhvDMAAAAASUVORK5CYII=",
  "base64",
);
const result = buildHandoutDocx({
  language: "es",
  template,
  descriptor: { sectionOrder, capacityPt },
  blocks: finished.blocks,
  whiteboard: { bytes: png, caption: finished.caption, altText: "Pizarra de prueba" },
  leaveCaptionBlank: false,
  footerText: finished.footerParagraphs.join("\n\n"),
});
console.log(JSON.stringify(result.report, null, 1));
if (!result.ok) {
  console.log("ERRORS:", result.errors);
  process.exit(1);
}
writeFileSync(output, result.docx);
console.log("wrote", output, result.docx.length, "bytes");
