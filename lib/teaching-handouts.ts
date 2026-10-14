// Handout uploads. Converts the Administrator's Word (.docx) handout into a small block structure that the
// review screens work on. A handout is never published, so unlike a teaching outline there is no public
// page: the only readers are the Administrator and the Content Managers it is sent to.
//
// The Word file uses the styles in the handout template (docs/handout-template.docx):
//
//   Heading 1  a section title            Subtitle   the section's subtitle (optional)
//   Heading 2  a paragraph title (optional)           Normal     a paragraph
//   List Bullet  a bullet                 Quote      the section's closing line
//
// Nothing here touches the database.
import { readInlines, readRelationships, readStyleNames } from "./teaching-docx-import.ts";
import { findAll, firstChild, openDocxPackage, parseXml, type XmlNode } from "./teaching-docx-package.ts";
import {
  inlinesToPlainText,
  normalizeStyleKey,
  readNumbering,
  toInlines,
  validateGatheringDate,
  type Context,
  type OutlineInline,
  type OutlineListItem,
} from "./teaching-outlines.ts";

export { isDocxMagicBytes, validateOutlineId as validateHandoutId } from "./teaching-outlines.ts";

export const HANDOUT_LIMITS = { title: 200, blocks: 3000, characters: 120_000 } as const;
export const HANDOUT_LANGUAGES = ["en", "es"] as const;
export type HandoutLanguage = (typeof HANDOUT_LANGUAGES)[number];

export type HandoutInline = OutlineInline;
export type HandoutListItem = OutlineListItem;
export type HandoutBlock =
  | { type: "section_title" | "subtitle" | "paragraph_title" | "paragraph" | "tagline"; inlines: HandoutInline[] }
  | { type: "list"; items: HandoutListItem[] };

export type ParsedHandout = { title: string; blocks: HandoutBlock[] };
export type HandoutParseResult = { ok: boolean; errors: string[]; warnings: string[]; handout: ParsedHandout | null };

const SPACES = /[ \t ]+/g;
// A line of box-drawing or dash characters used as a divider in the old Word handouts.
const DIVIDER = /^[\s─-╿\-_=*~.•·]+$/;
const TYPED_BULLET = /^[•·▪●◦‣-]\s+/;

function headingLevel(key: string) {
  const match = key.match(/^heading([1-9])$/);
  return match ? Number(match[1]) : null;
}

/** Titles, subtitles and closing lines are styled by the site, so any bold or italic from Word is dropped. */
function plainInlines(inlines: HandoutInline[]): HandoutInline[] {
  const text = inlinesToPlainText(inlines).replace(SPACES, " ").trim();
  return text ? [{ text }] : [];
}

export function parseHandoutDocxParts(parts: {
  documentXml: string;
  stylesXml?: string | null;
  relationshipsXml?: string | null;
  numberingXml?: string | null;
  hasComments?: boolean;
}): HandoutParseResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  let root: XmlNode;
  try {
    root = parseXml(parts.documentXml);
  } catch {
    return { ok: false, errors: ["The .docx document content could not be read."], warnings, handout: null };
  }

  const { names: styleNames, defaultId } = readStyleNames(parts.stylesXml);
  const relationships = readRelationships(parts.relationshipsXml);
  const numbering = readNumbering(parts.numberingXml);
  const context: Context = { badLinks: [] };

  const blocks: HandoutBlock[] = [];
  let title: string | null = null;
  let characters = 0;
  let typedBullets = 0;
  let outsideSection = 0;
  let unstyledTitles = 0;
  let sections = 0;

  const pushItem = (item: HandoutListItem) => {
    const last = blocks[blocks.length - 1];
    if (last?.type === "list") last.items.push(item);
    else blocks.push({ type: "list", items: [item] });
  };

  const handleParagraph = (node: XmlNode) => {
    const properties = firstChild(node, "w:pPr");
    const styleId = (properties && firstChild(properties, "w:pStyle")?.attrs["w:val"]) || defaultId;
    const key = normalizeStyleKey(styleNames.get(styleId) ?? styleId);
    const inlines = toInlines(readInlines(node, relationships), context);
    if (!inlines.length) return;
    const plain = inlinesToPlainText(inlines);
    if (DIVIDER.test(plain)) return;
    characters += plain.length;

    if (key === "title") {
      if (title === null) title = plain.replace(SPACES, " ").trim();
      return;
    }

    const level = headingLevel(key);
    if (level === 1) {
      sections += 1;
      blocks.push({ type: "section_title", inlines: plainInlines(inlines) });
      return;
    }
    if (level !== null) {
      if (level > 2) warnings.push(`A Heading ${level} paragraph ("${plain.slice(0, 40)}") was read as a paragraph title. The template uses Heading 1 and Heading 2 only.`);
      blocks.push({ type: "paragraph_title", inlines: plainInlines(inlines) });
      return;
    }
    if (key === "subtitle") {
      blocks.push({ type: "subtitle", inlines: plainInlines(inlines) });
      return;
    }
    if (key === "quote" || key === "intensequote") {
      blocks.push({ type: "tagline", inlines: plainInlines(inlines) });
      return;
    }

    // Bulleted list: a numbering reference, or one of Word's built-in list styles.
    const numPr = properties ? firstChild(properties, "w:numPr") : undefined;
    const numId = numPr ? firstChild(numPr, "w:numId")?.attrs["w:val"] : undefined;
    const ilvl = numPr ? Number(firstChild(numPr, "w:ilvl")?.attrs["w:val"] ?? 0) : 0;
    let listLevel: number | null = null;
    let ordered = false;
    if (numId && numId !== "0") {
      listLevel = Number.isFinite(ilvl) ? ilvl : 0;
      ordered = numbering.isOrdered(numId, listLevel);
    } else if (!numPr) {
      const styled = key.match(/^list(bullet|number|continue)?(\d)?$/);
      if (styled && styled[1] !== "continue" && (styled[1] || styled[2])) {
        listLevel = styled[2] ? Number(styled[2]) - 1 : 0;
        ordered = styled[1] === "number";
      }
    }
    if (listLevel !== null) {
      if (!sections) outsideSection += 1;
      pushItem({ level: Math.min(listLevel, 3), ordered, inlines });
      return;
    }

    // A bullet typed by hand ("• Behold the Lord. …") is still a bullet: take the character off.
    if (TYPED_BULLET.test(plain)) {
      typedBullets += 1;
      const stripped = inlines.map((inline) => ({ ...inline }));
      stripped[0].text = stripped[0].text.replace(TYPED_BULLET, "");
      const cleaned = stripped.filter((inline) => inline.text.length > 0);
      if (cleaned.length) {
        if (!sections) outsideSection += 1;
        pushItem({ level: 0, ordered: false, inlines: cleaned });
        return;
      }
    }

    // A short, wholly bold line in the Normal style is almost certainly a title that was not styled.
    if (inlines.every((inline) => inline.bold) && plain.length <= 80) unstyledTitles += 1;
    if (!sections) outsideSection += 1;
    blocks.push({ type: "paragraph", inlines });
  };

  const walk = (node: XmlNode) => {
    for (const child of node.children) {
      if (child.name === "w:p") handleParagraph(child);
      else if (child.name === "w:sdt") {
        const content = firstChild(child, "w:sdtContent");
        if (content) walk(content);
      } else if (["#document", "w:document", "w:body", "w:sdtContent", "mc:AlternateContent", "mc:Choice"].includes(child.name)) {
        walk(child);
      }
    }
  };
  walk(root);

  if (findAll(root, "w:tbl").length) warnings.push("The document contains a table. Tables are not imported.");
  if (findAll(root, "w:drawing").length || findAll(root, "w:pict").length) warnings.push("Images and drawings in the document are not imported.");
  if (findAll(root, "w:ins").length || findAll(root, "w:del").length) warnings.push("The document has tracked changes. Accept or reject them in Word first, or some text may be missing here.");
  if (parts.hasComments) warnings.push("The document has Word comments. Comments are not imported.");
  if (context.badLinks.length) {
    const sample = [...new Set(context.badLinks)].slice(0, 5).map((label) => `"${label}"`).join(", ");
    warnings.push(`${context.badLinks.length} link${context.badLinks.length === 1 ? "" : "s"} could not be used and show as plain text: ${sample}. Only http(s) web addresses are supported.`);
  }
  if (typedBullets) warnings.push(`${typedBullets} line${typedBullets === 1 ? " starts" : "s start"} with a typed bullet character. ${typedBullets === 1 ? "It was" : "They were"} read as a bullet. Next time use the List Bullet style.`);
  if (outsideSection) warnings.push(`${outsideSection} paragraph${outsideSection === 1 ? " comes" : "s come"} before the first Heading 1, so ${outsideSection === 1 ? "it is" : "they are"} not inside a section.`);

  if (!sections) {
    errors.push(
      unstyledTitles
        ? "No section titles were found. This document does not use the handout styles: its titles are bold text, not Heading 1. Apply the styles from the handout template (Heading 1 for a section title, Heading 2 for a paragraph title) and upload again."
        : "No section titles were found. Give each section's title the Heading 1 style, as in the handout template, and upload again.",
    );
  } else if (unstyledTitles) {
    warnings.push(`${unstyledTitles} short bold line${unstyledTitles === 1 ? "" : "s"} in the Normal style may be a title that was not given Heading 1 or Heading 2.`);
  }
  if (!blocks.length) errors.push("The document has no readable content.");
  if (blocks.length > HANDOUT_LIMITS.blocks) errors.push(`The document has more than ${HANDOUT_LIMITS.blocks.toLocaleString()} paragraphs.`);
  if (characters > HANDOUT_LIMITS.characters) errors.push(`The document is longer than ${HANDOUT_LIMITS.characters.toLocaleString()} characters.`);

  const firstSection = blocks.find((block) => block.type === "section_title") as { inlines: HandoutInline[] } | undefined;
  const resolvedTitle = (title ?? (firstSection ? inlinesToPlainText(firstSection.inlines) : "")).replace(SPACES, " ").trim();
  if (resolvedTitle.length > HANDOUT_LIMITS.title) errors.push(`The title is longer than ${HANDOUT_LIMITS.title} characters.`);

  return { ok: errors.length === 0, errors, warnings, handout: { title: resolvedTitle, blocks } };
}

export function parseHandoutDocx(buffer: Buffer): HandoutParseResult {
  try {
    const docx = openDocxPackage(buffer);
    const documentXml = docx.readPart("word/document.xml");
    if (!documentXml) return { ok: false, errors: ["This file is not a valid Word document (word/document.xml is missing)."], warnings: [], handout: null };
    const comments = docx.readPart("word/comments.xml");
    return parseHandoutDocxParts({
      documentXml,
      stylesXml: docx.readPart("word/styles.xml"),
      relationshipsXml: docx.readPart("word/_rels/document.xml.rels"),
      numberingXml: docx.readPart("word/numbering.xml"),
      hasComments: Boolean(comments && comments.includes("<w:comment ")),
    });
  } catch (error) {
    return { ok: false, errors: [error instanceof Error ? error.message : "The .docx document could not be read."], warnings: [], handout: null };
  }
}

// --- file name and validation ------------------------------------------------

/**
 * The handout files are named en_YYYYMMDD_something.docx. The language and the teaching date are read from
 * the front of the name; the Administrator confirms both on the preview. A bare leading YYYYMMDD also works.
 */
export function suggestHandoutFromFileName(fileName: string): { language: HandoutLanguage | null; date: string | null; unsupportedLanguage: string | null } {
  const match = fileName.match(/^(?:([a-z]{2})[_\- ])?(\d{4})(\d{2})(\d{2})(?!\d)/i);
  if (!match) return { language: null, date: null, unsupportedLanguage: null };
  const date = validateGatheringDate(`${match[2]}-${match[3]}-${match[4]}`).value ?? null;
  const code = match[1]?.toLowerCase() ?? null;
  if (code && !(HANDOUT_LANGUAGES as readonly string[]).includes(code)) return { language: null, date, unsupportedLanguage: code };
  return { language: code ? (code as HandoutLanguage) : null, date, unsupportedLanguage: null };
}

export function validateHandoutTitle(value: unknown) {
  const title = typeof value === "string" ? value.replace(SPACES, " ").trim() : "";
  if (!title) return { error: "Title is required." };
  if (title.length > HANDOUT_LIMITS.title) return { error: `Title must be ${HANDOUT_LIMITS.title} characters or fewer.` };
  return { value: title };
}

/** The teaching date a handout goes with. Unlike an outline's, it is required. */
export function validateHandoutDate(value: unknown) {
  const result = validateGatheringDate(value);
  if (result.error) return { error: result.error };
  if (!result.value) return { error: "Choose the date of the teaching this handout goes with." };
  return { value: result.value };
}

// --- the same words, as plain text, for the final copy-out page ------------------

function inlineMarkup(inlines: HandoutInline[]) {
  return inlines.map((inline) => inline.text).join("");
}

export type HandoutSection = {
  title: HandoutInline[] | null;
  subtitle: HandoutInline[] | null;
  /** Everything after the title and subtitle, in order. */
  body: HandoutBlock[];
};

/** Groups the flat block list into sections, each starting at a section_title. */
export function handoutSections(blocks: unknown): HandoutSection[] {
  const sections: HandoutSection[] = [];
  let current: HandoutSection | null = null;
  for (const raw of Array.isArray(blocks) ? blocks : []) {
    const block = raw as HandoutBlock;
    if (!block || typeof block !== "object") continue;
    if (block.type === "section_title") {
      current = { title: block.inlines, subtitle: null, body: [] };
      sections.push(current);
      continue;
    }
    if (!current) {
      current = { title: null, subtitle: null, body: [] };
      sections.push(current);
    }
    if (block.type === "subtitle" && current.subtitle === null && current.body.length === 0) current.subtitle = block.inlines;
    else current.body.push(block);
  }
  return sections;
}

/** One section as plain text, ready to paste: title, subtitle, then each paragraph and bullet. */
export function sectionPlainText(section: HandoutSection) {
  const lines: string[] = [];
  if (section.title) lines.push(inlineMarkup(section.title));
  if (section.subtitle) lines.push(inlineMarkup(section.subtitle));
  for (const block of section.body) {
    if (lines.length) lines.push("");
    if (block.type === "list") lines.push(block.items.map((item) => `• ${inlineMarkup(item.inlines)}`).join("\n"));
    else if ("inlines" in block) lines.push(inlineMarkup(block.inlines));
  }
  return lines.join("\n");
}
