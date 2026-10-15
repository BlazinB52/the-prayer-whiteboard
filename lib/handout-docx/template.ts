// Reads a handout template (a Word file) and finds the parts the builder fills: the three section text boxes, the
// whiteboard caption, the footer, and the whiteboard picture. Everything else in the file is left byte for byte as it is,
// so nothing the template's author positioned can move.
import type { Family } from "./measure.ts";

export const EMU_PER_INCH = 914400;
export const EMU_PER_POINT = 12700;

export type BoxKind = "section" | "caption" | "footer" | "other";

/** One text box, which Word stores twice: a modern copy and an older fallback copy of the same text. */
export type TextBox = {
  kind: BoxKind;
  /** Start and end of the <w:txbxContent> element in word/document.xml, for the modern copy and then the fallback. */
  ranges: { start: number; end: number }[];
  widthEmu: number;
  heightEmu: number;
  paragraphs: string[];
};

export type RoleName = "title" | "subtitle" | "body" | "paragraphTitle" | "bullet" | "tagline";

/** What one kind of paragraph looks like in a box: its own paragraph properties and its character formatting. */
export type RoleStyle = {
  /** The paragraph's <w:pPr> element, whole. */
  pPr: string;
  /** The character formatting runs of this role start from (the paragraph mark's, or the first run's). */
  rPr: string;
  sizeHalfPoints: number;
  fixedSize: boolean;
  beforeTwips: number;
  afterTwips: number;
  lineTwips: number;
  leftTwips: number;
  hangingTwips: number;
  center: boolean;
  caps: boolean;
  family: Family;
};

const PARAGRAPH = /<w:p[ >][\s\S]*?<\/w:p>/g;
const TEXT = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g;

export function paragraphsOf(xml: string): string[] {
  return xml.match(PARAGRAPH) ?? [];
}

export function textOf(paragraph: string): string {
  let out = "";
  for (const match of paragraph.matchAll(TEXT)) out += match[1];
  return decodeXml(out);
}

export function decodeXml(value: string) {
  return value.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}

export function encodeXml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Every text box in the document, in order, with its size taken from the picture frame it sits in. */
export function findTextBoxes(documentXml: string): TextBox[] {
  const ranges: { start: number; end: number }[] = [];
  const pattern = /<w:txbxContent>([\s\S]*?)<\/w:txbxContent>/g;
  for (const match of documentXml.matchAll(pattern)) {
    const start = (match.index ?? 0) + "<w:txbxContent>".length;
    ranges.push({ start, end: start + match[1].length });
  }
  if (ranges.length % 2 !== 0) throw new Error("The template's text boxes are not in the pairs Word writes (a modern copy and a fallback copy).");

  const boxes: TextBox[] = [];
  for (let i = 0; i < ranges.length; i += 2) {
    const first = ranges[i];
    const second = ranges[i + 1];
    const a = documentXml.slice(first.start, first.end);
    const b = documentXml.slice(second.start, second.end);
    if (a.length !== b.length && textOf(a) !== textOf(b)) throw new Error("A text box's two copies do not match, so the template cannot be read safely.");

    const anchorStart = documentXml.lastIndexOf("<wp:anchor", first.start);
    const anchor = documentXml.slice(anchorStart, first.start);
    const extent = anchor.match(/<wp:extent cx="(\d+)" cy="(\d+)"/);
    if (!extent) throw new Error("A text box in the template has no size.");
    const widthEmu = Number(extent[1]);
    const heightEmu = Number(extent[2]);
    const paragraphs = paragraphsOf(a);

    let kind: BoxKind = "other";
    if (paragraphs.some((paragraph) => /<w:outlineLvl w:val="0"\/>/.test(paragraph))) kind = "section";
    else if (Math.abs(widthEmu / EMU_PER_INCH - 3.724) < 0.08) kind = "caption";
    else if (Math.abs(widthEmu / EMU_PER_INCH - 4.98) < 0.08) kind = "footer";
    boxes.push({ kind, ranges: [first, second], widthEmu, heightEmu, paragraphs });
  }
  return boxes;
}

const attr = (xml: string, element: string, name: string) => {
  const match = xml.match(new RegExp(`<w:${element}\\b[^>]*\\sw:${name}="(-?\\d+)"`));
  return match ? Number(match[1]) : null;
};

export function roleOf(paragraph: string, index: number): RoleName | null {
  if (!textOf(paragraph).trim()) return null;
  if (/<w:outlineLvl w:val="0"\/>/.test(paragraph)) return "title";
  if (/<w:outlineLvl w:val="1"\/>/.test(paragraph)) return "paragraphTitle";
  if (/<w:ind [^>]*w:hanging=/.test(paragraph)) return "bullet";
  const centered = /<w:pPr>[\s\S]*?<w:jc w:val="center"\/>/.test(paragraph);
  const italic = /<w:r\b[\s\S]*?<w:rPr>[\s\S]*?<w:i\/>/.test(paragraph);
  if (centered && italic) return "tagline";
  if (centered && index <= 2) return "subtitle";
  return "body";
}

export function styleOf(paragraph: string): RoleStyle {
  const pPr = paragraph.match(/<w:pPr>[\s\S]*?<\/w:pPr>/)?.[0] ?? "<w:pPr></w:pPr>";
  const markRPr = pPr.match(/<w:rPr>[\s\S]*?<\/w:rPr>/)?.[0];
  const firstRun = paragraph.match(/<w:r\b[\s\S]*?<\/w:r>/)?.[0] ?? "";
  const runRPr = firstRun.match(/<w:rPr>[\s\S]*?<\/w:rPr>/)?.[0];
  // The paragraph mark's formatting is the role's base: a bold lead-in run is bold by its own run, not by the base.
  const rPr = markRPr ?? runRPr ?? "<w:rPr></w:rPr>";
  const size = rPr.match(/<w:sz w:val="(\d+)"\/>/);
  const fonts = rPr.match(/w:ascii="([^"]+)"/)?.[1] ?? "Georgia";
  return {
    pPr,
    rPr,
    sizeHalfPoints: size ? Number(size[1]) : 22,
    fixedSize: false,
    beforeTwips: attr(pPr, "spacing", "before") ?? 0,
    afterTwips: attr(pPr, "spacing", "after") ?? 80,
    lineTwips: attr(pPr, "spacing", "line") ?? 247,
    leftTwips: attr(pPr, "ind", "left") ?? 0,
    hangingTwips: attr(pPr, "ind", "hanging") ?? 0,
    center: /<w:jc w:val="center"\/>/.test(pPr),
    caps: /<w:caps\/>/.test(rPr),
    family: /georgia/i.test(fonts) ? "georgia" : "calibri",
  };
}

/** The first paragraph of each role in a section box: the title, subtitle, body, paragraph title, bullet and closing line. */
export function roleStyles(box: TextBox): Partial<Record<RoleName, RoleStyle>> {
  const styles: Partial<Record<RoleName, RoleStyle>> = {};
  box.paragraphs.forEach((paragraph, index) => {
    const role = roleOf(paragraph, index);
    if (role && !styles[role]) styles[role] = styleOf(paragraph);
  });
  for (const role of ["title", "subtitle"] as const) if (styles[role]) styles[role]!.fixedSize = true;
  return styles;
}

/** The empty paragraph Word keeps at the end of a text box. It is kept as the template has it. */
export function trailingEmptyParagraph(box: TextBox): string {
  const last = box.paragraphs[box.paragraphs.length - 1];
  return last && !textOf(last).trim() ? last : "";
}
