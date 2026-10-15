// Builds the handout Word file: the template (a finished handout) with the three sections' text, the whiteboard picture,
// its caption and the footer replaced. Every text box, picture and shape keeps the position and size it has in the
// template. If a section does not fit, the build stops and says which and by how much; nothing is ever cut.
import { markupToInlines } from "../handout-translate.ts";
import type { HandoutBlock, HandoutInline } from "../teaching-handouts.ts";
import { heightOf, innerHeightPt, innerWidthPt, paragraphXml, piecesOfSection, plainParagraphXml, type Piece, type Settings } from "./fill.ts";
import { countLines, lineHeightPt } from "./measure.ts";
import { encodeXml, findTextBoxes, roleStyles, styleOf, trailingEmptyParagraph, type RoleName, type RoleStyle, type TextBox } from "./template.ts";
import { readZip, writeZip } from "./zip.ts";

export type TemplateDescriptor = {
  /** Which handout section each section box holds, in the order the boxes are written in the file. */
  sectionOrder: number[];
  /** How much text each section box can hold, in points, in the same order. Measured on the finished handout the template was made from. */
  capacityPt: number[];
};

export type BuildInput = {
  language: "en" | "es";
  template: Buffer;
  descriptor: TemplateDescriptor;
  blocks: HandoutBlock[];
  whiteboard: { bytes: Buffer; caption: string | null; altText: string | null };
  /** Leave the caption box with a highlighted placeholder, to be written in Word. */
  leaveCaptionBlank: boolean;
  /** The footer's text: paragraphs separated by blank lines, with **bold** where wanted. */
  footerText: string;
};

export type SectionReport = { section: number; title: string; sizePt: number; spacing: number; lineSpacing: number; usedPt: number; capacityPt: number; adjustments: string[] };
export type BuildReport = {
  sections: SectionReport[];
  caption: { lines: number; roomLines: number; blank: boolean } | null;
  footer: { sizePt: number; usedPt: number; capacityPt: number } | null;
  warnings: string[];
};
export type BuildResult = { ok: true; docx: Buffer; report: BuildReport } | { ok: false; errors: string[]; report: BuildReport };

const INCH = 72;

// From largest to smallest: spacing is tightened first (a hair at a time), then the line spacing, then the size, and never
// below 10 pt for the text. Each step is only taken when the one before did not fit.
export const FIT_STEPS: { spacing: number; line: number; half: number; label: string }[] = [
  { spacing: 1, line: 1, half: 22, label: "" },
  { spacing: 0.75, line: 1, half: 22, label: "space between paragraphs tightened to 75%" },
  { spacing: 0.5, line: 1, half: 22, label: "space between paragraphs tightened to 50%" },
  { spacing: 0.5, line: 252 / 264, half: 22, label: "line spacing tightened a little" },
  { spacing: 1, line: 1, half: 21, label: "text 10.5 pt" },
  { spacing: 0.75, line: 1, half: 21, label: "text 10.5 pt, space between paragraphs 75%" },
  { spacing: 0.5, line: 1, half: 21, label: "text 10.5 pt, space between paragraphs 50%" },
  { spacing: 0.5, line: 252 / 264, half: 21, label: "text 10.5 pt, line spacing tightened a little" },
  { spacing: 0.5, line: 1, half: 20, label: "text 10 pt, space between paragraphs 50%" },
  { spacing: 0.5, line: 252 / 264, half: 20, label: "text 10 pt, line spacing tightened a little" },
];

// The footer goes from its template size down; 6 pt is the usual, 5 and 4 only when it has to.
const FOOTER_SIZES_HALF_POINTS = [14, 13, 12, 11, 10, 9, 8];

/** Groups blocks into sections, each starting at a section title. Text before the first title is an error for the caller. */
export function splitSections(blocks: HandoutBlock[]): { sections: HandoutBlock[][]; strayBlocks: number } {
  const sections: HandoutBlock[][] = [];
  let stray = 0;
  for (const block of blocks) {
    if (block.type === "section_title") sections.push([block]);
    else if (sections.length) sections[sections.length - 1].push(block);
    else stray += 1;
  }
  return { sections, strayBlocks: stray };
}

const plainText = (inlines: HandoutInline[]) => inlines.map((inline) => inline.text).join("");
const inches = (points: number) => `${(points / INCH).toFixed(2)} in`;

function pngSize(bytes: Buffer): { width: number; height: number } | null {
  if (bytes.length < 24 || bytes.readUInt32BE(0) !== 0x89504e47) return null;
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

/** Finds a role's paragraph style in the section's own box, then in the others. */
function stylesFor(boxes: TextBox[], index: number) {
  const own = roleStyles(boxes[index]);
  const merged: Partial<Record<RoleName, RoleStyle>> = { ...own };
  for (const box of boxes) {
    const other = roleStyles(box);
    for (const role of Object.keys(other) as RoleName[]) if (!merged[role]) merged[role] = other[role];
  }
  return merged;
}

export function buildHandoutDocx(input: BuildInput): BuildResult {
  const report: BuildReport = { sections: [], caption: null, footer: null, warnings: [] };
  const errors: string[] = [];
  const fail = (): BuildResult => ({ ok: false, errors, report });

  let parts: Map<string, Buffer>;
  try {
    parts = readZip(input.template);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "The handout template could not be read.");
    return fail();
  }
  let documentXml = parts.get("word/document.xml")?.toString("utf8");
  if (!documentXml) {
    errors.push("The handout template is not a Word file.");
    return fail();
  }

  let boxes: TextBox[];
  try {
    boxes = findTextBoxes(documentXml);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "The handout template could not be read.");
    return fail();
  }
  const sectionBoxes = boxes.filter((box) => box.kind === "section");
  const captionBox = boxes.find((box) => box.kind === "caption");
  const footerBox = boxes.find((box) => box.kind === "footer");
  if (sectionBoxes.length !== input.descriptor.sectionOrder.length || !captionBox || !footerBox) {
    errors.push("The handout template does not have the three section boxes, the caption box and the footer box this builder expects.");
    return fail();
  }

  const { sections, strayBlocks } = splitSections(input.blocks);
  if (sections.length !== sectionBoxes.length) errors.push(`The handout has ${sections.length} section${sections.length === 1 ? "" : "s"}, and the template has room for ${sectionBoxes.length}.`);
  if (strayBlocks) errors.push(`${strayBlocks} paragraph${strayBlocks === 1 ? " comes" : "s come"} before the first section title.`);
  if (errors.length) return fail();

  // What replaces each text box's content, by the box's index in the file.
  const replacements = new Map<TextBox, string>();

  // --- the three sections ---------------------------------------------------------------------------------------
  sectionBoxes.forEach((box, boxIndex) => {
    const number = input.descriptor.sectionOrder[boxIndex];
    const content = sections[number - 1];
    const pieces: Piece[] = piecesOfSection(content);
    const styles = stylesFor(sectionBoxes, boxIndex);
    const title = plainText(content[0] && content[0].type === "section_title" ? content[0].inlines : []);
    const missing = [...new Set(pieces.map((piece) => piece.role))].filter((role) => !styles[role]);
    if (missing.length) {
      errors.push(`Section ${number} ("${title}") uses a kind of paragraph (${missing.join(", ")}) that the template does not have.`);
      return;
    }

    const width = innerWidthPt(box.widthEmu);
    const capacity = input.descriptor.capacityPt[boxIndex];
    let chosen: (typeof FIT_STEPS)[number] | null = null;
    let used = 0;
    for (const step of FIT_STEPS) {
      used = heightOf(pieces, styles, { sizeHalfPoints: step.half, spacingScale: step.spacing, lineScale: step.line }, width);
      if (used <= capacity) {
        chosen = step;
        break;
      }
    }
    if (!chosen) {
      const last = FIT_STEPS[FIT_STEPS.length - 1];
      const smallest = heightOf(pieces, styles, { sizeHalfPoints: last.half, spacingScale: last.spacing, lineScale: last.line }, width);
      errors.push(
        `Section ${number} ("${title}") does not fit its box: even at 10 pt with the spacing tightened it is about ${inches(smallest - capacity)} too tall. Shorten that section, or make its box taller in the template. Nothing was cut.`,
      );
      report.sections.push({ section: number, title, sizePt: 10, spacing: last.spacing, lineSpacing: last.line, usedPt: smallest, capacityPt: capacity, adjustments: ["does not fit"] });
      return;
    }

    const settings: Settings = { sizeHalfPoints: chosen.half, spacingScale: chosen.spacing, lineScale: chosen.line };
    const xml = pieces.map((piece) => paragraphXml(piece, (styles[piece.role] ?? styles.body)!, settings, input.language)).join("");
    replacements.set(box, `${xml}${trailingEmptyParagraph(box)}`);
    report.sections.push({ section: number, title, sizePt: chosen.half / 2, spacing: chosen.spacing, lineSpacing: chosen.line, usedPt: used, capacityPt: capacity, adjustments: chosen.label ? [chosen.label] : [] });
    if (used > capacity * 0.97) report.warnings.push(`Section ${number} ("${title}") is very full (${Math.round((used / capacity) * 100)}% of its box). Check it in Word.`);
  });
  report.sections.sort((a, b) => a.section - b.section);

  // --- the caption -----------------------------------------------------------------------------------------------
  {
    const proto = captionBox.paragraphs.find((paragraph) => paragraph.includes("<w:t")) ?? captionBox.paragraphs[0];
    const style = styleOf(proto);
    const firstRunRPr = proto.match(/<w:r\b[\s\S]*?(<w:rPr>[\s\S]*?<\/w:rPr>)/)?.[1] ?? style.rPr;
    const half = Number(firstRunRPr.match(/<w:sz w:val="(\d+)"\/>/)?.[1] ?? style.sizeHalfPoints);
    const caption = (input.whiteboard.caption ?? "").trim();
    const width = innerWidthPt(captionBox.widthEmu);
    const roomLines = Math.max(1, Math.floor(innerHeightPt(captionBox.heightEmu) / lineHeightPt(style.family, half / 2, style.lineTwips / 240)));
    const blank = input.leaveCaptionBlank || !caption;
    if (!input.leaveCaptionBlank && !caption) report.warnings.push("The whiteboard has no caption, so the caption box has a placeholder for you to fill in Word.");

    if (blank) {
      const placeholder = input.language === "es" ? "[Escribí aquí el pie de foto]" : "[Write the caption here]";
      const highlight = '<w:highlight w:val="yellow"/>';
      const rPr = firstRunRPr.includes("<w:lang") ? firstRunRPr.replace("<w:lang", `${highlight}<w:lang`) : firstRunRPr.replace("</w:rPr>", `${highlight}</w:rPr>`);
      const xml = `<w:p>${style.pPr}<w:r>${rPr}<w:t xml:space="preserve">${encodeXml(placeholder)}</w:t></w:r></w:p>`;
      replacements.set(captionBox, xml + trailingEmptyParagraph(captionBox));
      report.caption = { lines: 1, roomLines, blank: true };
    } else {
      const lines = countLines([{ text: caption }], style.family, half / 2, width, width);
      if (lines > roomLines) {
        errors.push(`The whiteboard's caption takes ${lines} lines and the caption box has room for ${roomLines}. Shorten the caption, or build with the caption left blank and add it in Word. Nothing was cut.`);
      } else {
        replacements.set(captionBox, plainParagraphXml(markupToInlines(caption), style.pPr, firstRunRPr, half, input.language) + trailingEmptyParagraph(captionBox));
        report.caption = { lines, roomLines, blank: false };
      }
    }
  }

  // --- the footer ------------------------------------------------------------------------------------------------
  {
    const proto = footerBox.paragraphs.find((paragraph) => paragraph.includes("<w:t")) ?? footerBox.paragraphs[0];
    const style = styleOf(proto);
    const firstRunRPr = proto.match(/<w:r\b[\s\S]*?(<w:rPr>[\s\S]*?<\/w:rPr>)/)?.[1] ?? style.rPr;
    const paragraphs = input.footerText
      .replace(/\r\n?/g, "\n")
      .split(/\n\s*\n/)
      .map((chunk) => chunk.trim().replace(/\s*\n\s*/g, " "))
      .filter(Boolean)
      .map((chunk) => markupToInlines(chunk));
    if (!paragraphs.length) {
      errors.push("The handout has no footer. Choose one in the Handout footer box and save it.");
    } else {
      const width = innerWidthPt(footerBox.widthEmu);
      const capacity = innerHeightPt(footerBox.heightEmu);
      const after = (style.afterTwips || 0) / 20;
      let chosen: number | null = null;
      let used = 0;
      for (const half of FOOTER_SIZES_HALF_POINTS) {
        used = 0;
        for (const inlines of paragraphs) {
          const lines = countLines(inlines.map((inline) => ({ text: inline.text, bold: inline.bold, italic: inline.italic })), style.family, half / 2, width, width);
          used += lines * lineHeightPt(style.family, half / 2, style.lineTwips / 240) + after;
        }
        if (used <= capacity) {
          chosen = half;
          break;
        }
      }
      if (!chosen) {
        errors.push(`The footer does not fit its box even at 4 pt (it is about ${inches(used - capacity)} too tall). Use a shorter footer. Nothing was cut.`);
      } else {
        if (chosen < 12) report.warnings.push(`The footer was set at ${chosen / 2} pt to fit its box. It is smaller than the usual 6 pt.`);
        replacements.set(footerBox, paragraphs.map((inlines) => plainParagraphXml(inlines, style.pPr, firstRunRPr, chosen!, input.language)).join("") + trailingEmptyParagraph(footerBox));
        report.footer = { sizePt: chosen / 2, usedPt: used, capacityPt: capacity };
      }
    }
  }

  // --- the whiteboard picture ----------------------------------------------------------------------------------------
  const size = pngSize(input.whiteboard.bytes);
  if (!size) errors.push("The whiteboard image is not a PNG file.");
  else if (Math.abs(size.width / size.height - 0.75) > 0.01) errors.push(`The whiteboard image is ${size.width} x ${size.height}, not the 3:4 shape the handout needs.`);

  let pictureEmbed: string | null = null;
  let pictureAnchorStart = -1;
  for (const match of documentXml.matchAll(/<wp:anchor\b[\s\S]*?<\/wp:anchor>/g)) {
    const extent = match[0].match(/<wp:extent cx="(\d+)" cy="(\d+)"/);
    const embed = match[0].match(/<a:blip r:embed="(\w+)"/);
    if (extent && embed && Number(extent[1]) / 914400 > 3.5 && Number(extent[2]) / 914400 > 5) {
      pictureEmbed = embed[1];
      pictureAnchorStart = match.index ?? -1;
      break;
    }
  }
  if (!pictureEmbed) errors.push("The handout template has no whiteboard picture.");
  if (errors.length) return fail();

  // --- write it all back ---------------------------------------------------------------------------------------------
  const edits: { start: number; end: number; text: string }[] = [];
  for (const [box, xml] of replacements) for (const range of box.ranges) edits.push({ start: range.start, end: range.end, text: xml });

  if (pictureAnchorStart >= 0) {
    const alt = (input.whiteboard.altText ?? "").trim();
    if (alt) {
      const docPr = documentXml.indexOf("<wp:docPr", pictureAnchorStart);
      const docPrEnd = documentXml.indexOf(">", docPr);
      const element = documentXml.slice(docPr, docPrEnd);
      const selfClosing = element.endsWith("/");
      const open = selfClosing ? element.slice(0, -1) : element;
      const withAlt = /\sdescr="[^"]*"/.test(open) ? open.replace(/\sdescr="[^"]*"/, ` descr="${encodeXml(alt)}"`) : `${open} descr="${encodeXml(alt)}"`;
      const next = selfClosing ? `${withAlt}/` : withAlt;
      edits.push({ start: docPr, end: docPrEnd, text: next });
    }
  }
  edits.sort((a, b) => b.start - a.start);
  for (const edit of edits) documentXml = documentXml.slice(0, edit.start) + edit.text + documentXml.slice(edit.end);
  parts.set("word/document.xml", Buffer.from(documentXml, "utf8"));

  // The picture: a new part, and the relationship the picture uses points at it. The old picture is dropped.
  const relsName = "word/_rels/document.xml.rels";
  const rels = parts.get(relsName)?.toString("utf8");
  const relPattern = new RegExp(`<Relationship\\b[^>]*\\bId="${pictureEmbed}"[^>]*/>`);
  const rel = rels?.match(relPattern)?.[0];
  if (!rels || !rel) {
    errors.push("The handout template's picture could not be found.");
    return fail();
  }
  const oldTarget = rel.match(/Target="([^"]+)"/)?.[1] ?? "";
  const newTarget = "media/whiteboard.png";
  parts.set(relsName, Buffer.from(rels.replace(rel, rel.replace(/Target="[^"]+"/, `Target="${newTarget}"`)), "utf8"));
  parts.set(`word/${newTarget}`, input.whiteboard.bytes);
  const stillUsed = [...(parts.get(relsName)?.toString("utf8").matchAll(/Target="([^"]+)"/g) ?? [])].some((m) => m[1] === oldTarget);
  if (oldTarget && !stillUsed) parts.delete(`word/${oldTarget}`);

  const contentTypes = parts.get("[Content_Types].xml")?.toString("utf8") ?? "";
  if (!/Extension="png"/i.test(contentTypes)) parts.set("[Content_Types].xml", Buffer.from(contentTypes.replace("<Default ", '<Default Extension="png" ContentType="image/png"/><Default '), "utf8"));

  return { ok: true, docx: writeZip(parts), report };
}

/**
 * How much text each section box of a finished handout holds, measured on the text it has now at the sizes and spacing it
 * has now, plus the room that is left in the box on the printed page (read from the finished handout: slackPt per box).
 * Run once on the finished handout a template is made from; the result goes in the template's descriptor.
 */
export function measureFinishedHandout(template: Buffer, slackPt: number[]) {
  const documentXml = readZip(template).get("word/document.xml")!.toString("utf8");
  const boxes = findTextBoxes(documentXml).filter((box) => box.kind === "section");
  return boxes.map((box, index) => {
    let used = 0;
    const width = innerWidthPt(box.widthEmu);
    for (const paragraph of box.paragraphs) {
      const text = paragraph.match(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g);
      if (!text) continue;
      const style = styleOf(paragraph);
      const runs = [...paragraph.matchAll(/<w:r\b[\s\S]*?<\/w:r>/g)].map((run) => ({
        text: (run[0].match(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g) ?? []).map((t) => t.replace(/<[^>]+>/g, "")).join("").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">"),
        bold: /<w:b\/>/.test(run[0]) || /<w:b\/>/.test(style.rPr),
        italic: /<w:i\/>/.test(run[0]) || /<w:i\/>/.test(style.rPr),
        half: Number(run[0].match(/<w:sz w:val="(\d+)"\/>/)?.[1] ?? style.sizeHalfPoints),
      }));
      if (!runs.length) continue;
      const half = Math.max(...runs.map((run) => run.half));
      const left = style.leftTwips / 20;
      const hanging = style.hangingTwips / 20;
      const lines = countLines(runs.map((run) => ({ text: style.caps ? run.text.toLocaleUpperCase() : run.text, bold: run.bold, italic: run.italic })), style.family, half / 2, width - (left - hanging), width - left);
      used += lines * lineHeightPt(style.family, half / 2, style.lineTwips / 240) + (style.beforeTwips + style.afterTwips) / 20;
    }
    return Math.round((used + (slackPt[index] ?? 0)) * 10) / 10;
  });
}
