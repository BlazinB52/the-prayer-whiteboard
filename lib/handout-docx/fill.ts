// Turns handout content into the paragraphs of a template's text boxes. Each paragraph is built from the template's own
// paragraph of that kind (a title, a subtitle, body text, a paragraph title, a bullet, a closing line), so the fonts,
// colours and indents are the template's. The fit step may change spacing and size in small, stated steps.
import type { HandoutBlock, HandoutInline } from "../teaching-handouts.ts";
import { countLines, lineHeightPt, type MeasureRun } from "./measure.ts";
import { EMU_PER_POINT, encodeXml, textOf, type RoleName, type RoleStyle } from "./template.ts";

export type Settings = {
  /** Body, paragraph title, bullet and closing-line size, in half-points (22 = 11 pt). */
  sizeHalfPoints: number;
  /** Multiplies the space before and after paragraphs. */
  spacingScale: number;
  /** Multiplies the line spacing. */
  lineScale: number;
};

export type Piece = { role: RoleName; inlines: HandoutInline[] };

/** The pieces of one section in reading order: title, subtitle, then its paragraphs, bullets and closing lines. */
export function piecesOfSection(blocks: HandoutBlock[]): Piece[] {
  const pieces: Piece[] = [];
  for (const block of blocks) {
    if (block.type === "section_title") pieces.push({ role: "title", inlines: block.inlines });
    else if (block.type === "subtitle") pieces.push({ role: "subtitle", inlines: block.inlines });
    else if (block.type === "paragraph_title") pieces.push({ role: "paragraphTitle", inlines: block.inlines });
    else if (block.type === "paragraph") pieces.push({ role: "body", inlines: block.inlines });
    else if (block.type === "tagline") pieces.push({ role: "tagline", inlines: block.inlines });
    else if (block.type === "list") for (const item of block.items) pieces.push({ role: "bullet", inlines: item.inlines });
  }
  return pieces;
}

export const sizeOf = (style: RoleStyle, settings: Settings) => (style.fixedSize ? style.sizeHalfPoints : settings.sizeHalfPoints);

const toRuns = (inlines: HandoutInline[], upper: boolean): MeasureRun[] =>
  inlines.map((inline) => ({ text: upper ? inline.text.toLocaleUpperCase() : inline.text, bold: inline.bold, italic: inline.italic }));

/** The height, in points, of a set of pieces in a box of a given inner width. */
export function heightOf(pieces: Piece[], styles: Partial<Record<RoleName, RoleStyle>>, settings: Settings, innerWidthPt: number): number {
  let total = 0;
  for (const piece of pieces) {
    const style = styles[piece.role] ?? styles.body;
    if (!style) continue;
    const size = sizeOf(style, settings) / 2;
    const left = style.leftTwips / 20;
    const hanging = style.hangingTwips / 20;
    const runs = toRuns(piece.inlines, style.caps);
    // Bold titles are measured bold; a run's own bold or italic is added on top of the role's.
    const baseBold = /<w:b\/>/.test(style.rPr);
    const baseItalic = /<w:i\/>/.test(style.rPr);
    const measured = runs.map((run) => ({ ...run, bold: run.bold || baseBold, italic: run.italic || baseItalic }));
    const lines = countLines(measured, style.family, size, innerWidthPt - (left - hanging), innerWidthPt - left);
    const lineSpacing = (style.lineTwips * (style.fixedSize ? 1 : settings.lineScale)) / 240;
    const spacingScale = style.fixedSize ? 1 : settings.spacingScale;
    total += lines * lineHeightPt(style.family, size, lineSpacing) + ((style.beforeTwips + style.afterTwips) * spacingScale) / 20;
  }
  return total;
}

// --- XML ----------------------------------------------------------------------------------------------------------

function setAttribute(element: string, name: string, value: number) {
  const pattern = new RegExp(`\\sw:${name}="-?\\d+"`);
  return pattern.test(element) ? element.replace(pattern, ` w:${name}="${value}"`) : element.replace(/\/?>$/, (end) => ` w:${name}="${value}"${end}`);
}

function scaledPPr(style: RoleStyle, settings: Settings) {
  let pPr = style.pPr;
  // A title and a subtitle keep the spacing the template gives them; only the text under them is tightened.
  if (style.fixedSize) return pPr;
  const spacing = pPr.match(/<w:spacing\b[^>]*\/>/)?.[0];
  const scaled = (value: number, scale: number) => Math.round(value * scale);
  if (spacing) {
    let next = spacing;
    if (style.beforeTwips) next = setAttribute(next, "before", scaled(style.beforeTwips, settings.spacingScale));
    next = setAttribute(next, "after", scaled(style.afterTwips, settings.spacingScale));
    next = setAttribute(next, "line", scaled(style.lineTwips, settings.lineScale));
    pPr = pPr.replace(spacing, next);
  }
  return pPr;
}

function withSize(rPr: string, halfPoints: number) {
  const size = `<w:sz w:val="${halfPoints}"/><w:szCs w:val="${halfPoints}"/>`;
  let out = rPr.replace(/<w:sz w:val="\d+"\/>/, "").replace(/<w:szCs w:val="\d+"\/>/, "");
  if (out.includes("<w:lang")) out = out.replace("<w:lang", `${size}<w:lang`);
  else out = out.replace("</w:rPr>", `${size}</w:rPr>`);
  return out;
}

function withEmphasis(rPr: string, bold?: boolean, italic?: boolean) {
  let add = "";
  if (bold && !/<w:b\/>/.test(rPr)) add += "<w:b/>";
  if (italic && !/<w:i\/>/.test(rPr)) add += "<w:i/>";
  if (!add) return rPr;
  if (/<w:rFonts\b[^>]*\/>/.test(rPr)) return rPr.replace(/(<w:rFonts\b[^>]*\/>)/, `$1${add}`);
  return rPr.replace("<w:rPr>", `<w:rPr>${add}`);
}

function withLanguage(xml: string, language: "en" | "es") {
  return language === "en" ? xml.replace(/w:val="es-SV"/g, 'w:val="en-US"') : xml;
}

/** One paragraph in the template's own formatting for its role. */
export function paragraphXml(piece: Piece, style: RoleStyle, settings: Settings, language: "en" | "es"): string {
  const base = withSize(style.rPr, sizeOf(style, settings));
  const runs = piece.inlines
    .filter((inline) => inline.text.length > 0)
    .map((inline) => `<w:r>${withEmphasis(base, inline.bold, inline.italic)}<w:t xml:space="preserve">${encodeXml(inline.text.replace(/\s*\n\s*/g, " "))}</w:t></w:r>`)
    .join("");
  return withLanguage(`<w:p>${scaledPPr(style, settings)}${runs}</w:p>`, language);
}

/** A paragraph from plain pieces of text, used for the caption and the footer. */
export function plainParagraphXml(inlines: HandoutInline[], pPr: string, rPr: string, halfPoints: number, language: "en" | "es"): string {
  const base = withSize(rPr, halfPoints);
  const runs = inlines
    .filter((inline) => inline.text.length > 0)
    .map((inline) => `<w:r>${withEmphasis(base, inline.bold, inline.italic)}<w:t xml:space="preserve">${encodeXml(inline.text)}</w:t></w:r>`)
    .join("");
  return withLanguage(`<w:p>${pPr}${runs}</w:p>`, language);
}

/** The words of a box's paragraphs, for checking what was written. */
export function wordsOf(paragraphs: string[]) {
  return paragraphs.map((paragraph) => textOf(paragraph)).join("\n");
}

export const innerWidthPt = (widthEmu: number) => (widthEmu - 2 * 91440) / EMU_PER_POINT;
export const innerHeightPt = (heightEmu: number) => (heightEmu - 2 * 45720) / EMU_PER_POINT;
