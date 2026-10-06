// Teaching outline uploads. Converts an ordinary Word (.docx) outline into a
// small, safe block structure (headings, paragraphs, lists, tables) that the
// site renders in its own styles. Unlike the teaching importer there are no
// format rules to follow: standard Word styles (Title, Subtitle, Heading 1-3,
// List Bullet/Number, Normal) are enough. Nothing here touches the database.
import {
  readInlines,
  readRelationships,
  readStyleNames,
  safeHref,
  type Inline,
} from "./teaching-docx-import.ts";
import { findAll, firstChild, openDocxPackage, parseXml, type XmlNode } from "./teaching-docx-package.ts";
import { isValidUuid } from "./uuid.ts";

export const OUTLINE_BUCKET = "teaching-outlines";
export const OUTLINE_LIMITS = {
  title: 200,
  subtitle: 300,
  categoryName: 80,
  blocks: 3000,
  characters: 250_000,
} as const;
export const OUTLINE_LANGUAGES = ["en", "es"] as const;
export type OutlineLanguage = (typeof OUTLINE_LANGUAGES)[number];

export type OutlineInline = { text: string; bold?: true; italic?: true; href?: string };
export type OutlineListItem = { level: number; ordered: boolean; inlines: OutlineInline[] };
export type OutlineBlock =
  | { type: "heading"; level: 1 | 2 | 3; inlines: OutlineInline[] }
  | { type: "paragraph"; inlines: OutlineInline[] }
  | { type: "list"; items: OutlineListItem[] }
  | { type: "table"; rows: OutlineInline[][][] };

export type ParsedOutline = {
  title: string;
  subtitle: string | null;
  blocks: OutlineBlock[];
};

export type OutlineParseResult = {
  ok: boolean;
  errors: string[];
  warnings: string[];
  outline: ParsedOutline | null;
};

const SPACES = /[ \t ]+/g;

function normalizeStyleKey(value: string) {
  return value.toLowerCase().replace(/[\s_-]+/g, "");
}

// --- numbering (bullet vs. numbered) --------------------------------------

type NumberingInfo = { isOrdered(numId: string, level: number): boolean };

function readNumbering(numberingXml: string | null | undefined): NumberingInfo {
  const formats = new Map<string, Map<number, string>>();
  const abstractByNum = new Map<string, string>();
  if (numberingXml) {
    const root = parseXml(numberingXml);
    for (const abstract of findAll(root, "w:abstractNum")) {
      const levels = new Map<number, string>();
      for (const level of findAll(abstract, "w:lvl")) {
        const format = firstChild(level, "w:numFmt")?.attrs["w:val"];
        if (format) levels.set(Number(level.attrs["w:ilvl"] ?? 0), format);
      }
      formats.set(abstract.attrs["w:abstractNumId"], levels);
    }
    for (const num of findAll(root, "w:num")) {
      const abstractId = firstChild(num, "w:abstractNumId")?.attrs["w:val"];
      if (abstractId) abstractByNum.set(num.attrs["w:numId"], abstractId);
    }
  }
  return {
    isOrdered(numId, level) {
      const format = formats.get(abstractByNum.get(numId) ?? "")?.get(level);
      return Boolean(format) && format !== "bullet" && format !== "none";
    },
  };
}

// --- inline handling --------------------------------------------------------

type Context = { badLinks: string[] };

function toInlines(raw: Inline[], context: Context): OutlineInline[] {
  const merged: OutlineInline[] = [];
  for (const inline of raw) {
    let href: string | undefined;
    if (inline.href !== null) {
      const safe = inline.linkLabelIssue ? null : safeHref(inline.href);
      if (safe) href = inline.href.trim();
      else if (inline.text.trim()) context.badLinks.push(inline.text.trim());
    }
    const next: OutlineInline = { text: inline.text.replace(SPACES, " ") };
    if (inline.bold) next.bold = true;
    if (inline.italic) next.italic = true;
    if (href) next.href = href;

    const last = merged[merged.length - 1];
    if (last && last.bold === next.bold && last.italic === next.italic && last.href === next.href) last.text += next.text;
    else merged.push(next);
  }

  // Trim the paragraph edges, then drop anything left empty.
  if (merged.length) merged[0].text = merged[0].text.replace(/^\s+/, "");
  if (merged.length) merged[merged.length - 1].text = merged[merged.length - 1].text.replace(/\s+$/, "");
  return merged.filter((inline) => inline.text.length > 0);
}

export function inlinesToPlainText(inlines: OutlineInline[]) {
  return inlines.map((inline) => inline.text).join("");
}

// --- document walk ---------------------------------------------------------

type Paragraph = {
  inlines: OutlineInline[];
  key: string;
  listLevel: number | null;
  ordered: boolean;
};

function headingLevelFromKey(key: string): 1 | 2 | 3 | null {
  const match = key.match(/^heading([1-9])$/);
  if (!match) return null;
  return Math.min(Number(match[1]), 3) as 1 | 2 | 3;
}

export function parseOutlineDocxParts(parts: {
  documentXml: string;
  stylesXml?: string | null;
  relationshipsXml?: string | null;
  numberingXml?: string | null;
  hasComments?: boolean;
  fileName?: string;
}): OutlineParseResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  let root: XmlNode;
  try {
    root = parseXml(parts.documentXml);
  } catch {
    return { ok: false, errors: ["The .docx document content could not be read."], warnings, outline: null };
  }

  const { names: styleNames, defaultId } = readStyleNames(parts.stylesXml);
  const relationships = readRelationships(parts.relationshipsXml);
  const numbering = readNumbering(parts.numberingXml);
  const context: Context = { badLinks: [] };

  const readParagraph = (node: XmlNode): Paragraph => {
    const properties = firstChild(node, "w:pPr");
    const styleId = (properties && firstChild(properties, "w:pStyle")?.attrs["w:val"]) || defaultId;
    const key = normalizeStyleKey(styleNames.get(styleId) ?? styleId);
    const inlines = toInlines(readInlines(node, relationships), context);

    let listLevel: number | null = null;
    let ordered = false;
    const numPr = properties ? firstChild(properties, "w:numPr") : undefined;
    const numId = numPr ? firstChild(numPr, "w:numId")?.attrs["w:val"] : undefined;
    const ilvl = numPr ? Number(firstChild(numPr, "w:ilvl")?.attrs["w:val"] ?? 0) : 0;

    if (numId && numId !== "0") {
      listLevel = Number.isFinite(ilvl) ? ilvl : 0;
      ordered = numbering.isOrdered(numId, listLevel);
    } else if (!numPr) {
      // Word's built-in list styles carry their numbering in the style itself.
      const styled = key.match(/^list(bullet|number|continue)?(\d)?$/);
      if (styled && styled[1] !== "continue" && (styled[1] || styled[2])) {
        listLevel = styled[2] ? Number(styled[2]) - 1 : 0;
        ordered = styled[1] === "number";
      }
    }
    return { inlines, key, listLevel, ordered };
  };

  const blocks: OutlineBlock[] = [];
  let title: string | null = null;
  let subtitle: string | null = null;
  let characters = 0;

  const pushBlock = (block: OutlineBlock) => {
    const last = blocks[blocks.length - 1];
    if (block.type === "list" && last?.type === "list") last.items.push(...block.items);
    else blocks.push(block);
  };

  const handleParagraph = (node: XmlNode) => {
    const paragraph = readParagraph(node);
    if (!paragraph.inlines.length) return;
    characters += inlinesToPlainText(paragraph.inlines).length;

    if (paragraph.key === "title" && title === null) {
      title = inlinesToPlainText(paragraph.inlines);
      return;
    }
    if (paragraph.key === "subtitle" && subtitle === null) {
      subtitle = inlinesToPlainText(paragraph.inlines);
      return;
    }
    const level = headingLevelFromKey(paragraph.key);
    if (level) pushBlock({ type: "heading", level, inlines: paragraph.inlines });
    else if (paragraph.listLevel !== null) {
      pushBlock({ type: "list", items: [{ level: Math.min(paragraph.listLevel, 3), ordered: paragraph.ordered, inlines: paragraph.inlines }] });
    } else pushBlock({ type: "paragraph", inlines: paragraph.inlines });
  };

  const handleTable = (table: XmlNode) => {
    const rows: OutlineInline[][][] = [];
    for (const row of table.children.filter((child) => child.name === "w:tr")) {
      const cells: OutlineInline[][] = [];
      for (const cell of row.children.filter((child) => child.name === "w:tc")) {
        const merged: OutlineInline[] = [];
        for (const paragraph of cell.children.filter((child) => child.name === "w:p")) {
          const inlines = toInlines(readInlines(paragraph, relationships), context);
          if (!inlines.length) continue;
          if (merged.length) merged.push({ text: " " });
          merged.push(...inlines);
        }
        characters += inlinesToPlainText(merged).length;
        cells.push(merged);
      }
      if (cells.some((cell) => cell.length)) rows.push(cells);
    }
    if (rows.length) pushBlock({ type: "table", rows });
  };

  const walk = (node: XmlNode) => {
    for (const child of node.children) {
      if (child.name === "w:p") handleParagraph(child);
      else if (child.name === "w:tbl") handleTable(child);
      else if (child.name === "w:sdt") {
        const content = firstChild(child, "w:sdtContent");
        if (content) walk(content);
      } else if (["#document", "w:document", "w:body", "w:sdtContent", "mc:AlternateContent", "mc:Choice"].includes(child.name)) {
        walk(child);
      }
    }
  };
  walk(root);

  if (findAll(root, "w:drawing").length || findAll(root, "w:pict").length) {
    warnings.push("Images and drawings in the document are not shown on the website. The original .docx still contains them for download.");
  }
  if (findAll(root, "w:ins").length || findAll(root, "w:del").length) {
    warnings.push("The document has tracked changes. Accept or reject them in Word first, or some text may be missing here.");
  }
  if (parts.hasComments) warnings.push("The document has Word comments. Comments are not shown on the website.");
  if (context.badLinks.length) {
    const sample = [...new Set(context.badLinks)].slice(0, 5).map((label) => `"${label}"`).join(", ");
    warnings.push(`${context.badLinks.length} link${context.badLinks.length === 1 ? "" : "s"} could not be used and show as plain text: ${sample}. Only http(s) web addresses are supported.`);
  }

  const resolvedTitle = (title ?? "").replace(SPACES, " ").trim();
  let finalTitle = resolvedTitle;
  if (!finalTitle) {
    const fromFile = (parts.fileName ?? "").replace(/\.docx$/i, "").replace(/^\d{8}[\s_-]*/, "").replace(/[-_]+/g, " ").replace(SPACES, " ").trim();
    finalTitle = fromFile;
    warnings.push(
      fromFile
        ? "The document has no Title-style paragraph, so the file name is used as the title. You can edit it before saving."
        : "The document has no Title-style paragraph. Enter a title before saving.",
    );
  }

  if (!blocks.length) errors.push("The document has no readable content.");
  if (blocks.length > OUTLINE_LIMITS.blocks) errors.push(`The document has more than ${OUTLINE_LIMITS.blocks.toLocaleString()} paragraphs. Split it into smaller outlines.`);
  if (characters > OUTLINE_LIMITS.characters) errors.push(`The document is longer than ${OUTLINE_LIMITS.characters.toLocaleString()} characters. Split it into smaller outlines.`);
  if (finalTitle.length > OUTLINE_LIMITS.title) errors.push(`The title is longer than ${OUTLINE_LIMITS.title} characters.`);

  const cleanSubtitle = subtitle === null ? null : (subtitle as string).replace(SPACES, " ").trim() || null;
  if (cleanSubtitle && cleanSubtitle.length > OUTLINE_LIMITS.subtitle) errors.push(`The subtitle is longer than ${OUTLINE_LIMITS.subtitle} characters.`);

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    outline: { title: finalTitle, subtitle: cleanSubtitle, blocks },
  };
}

export function parseOutlineDocx(buffer: Buffer, fileName?: string): OutlineParseResult {
  try {
    const docx = openDocxPackage(buffer);
    const documentXml = docx.readPart("word/document.xml");
    if (!documentXml) {
      return { ok: false, errors: ["This file is not a valid Word document (word/document.xml is missing)."], warnings: [], outline: null };
    }
    const comments = docx.readPart("word/comments.xml");
    return parseOutlineDocxParts({
      documentXml,
      stylesXml: docx.readPart("word/styles.xml"),
      relationshipsXml: docx.readPart("word/_rels/document.xml.rels"),
      numberingXml: docx.readPart("word/numbering.xml"),
      hasComments: Boolean(comments && comments.includes("<w:comment ")),
      fileName,
    });
  } catch (error) {
    return { ok: false, errors: [error instanceof Error ? error.message : "The .docx document could not be read."], warnings: [], outline: null };
  }
}

// --- validation and helpers -------------------------------------------------

export function validateOutlineTitle(value: unknown) {
  const title = typeof value === "string" ? value.replace(SPACES, " ").trim() : "";
  if (!title) return { error: "Title is required." };
  if (title.length > OUTLINE_LIMITS.title) return { error: `Title must be ${OUTLINE_LIMITS.title} characters or fewer.` };
  return { value: title };
}

export function validateOutlineCategoryName(value: unknown) {
  const name = typeof value === "string" ? value.replace(SPACES, " ").trim() : "";
  if (!name) return { error: "Category name is required." };
  if (name.length > OUTLINE_LIMITS.categoryName) return { error: `Category name must be ${OUTLINE_LIMITS.categoryName} characters or fewer.` };
  return { value: name };
}

export function validateOutlineLanguage(value: unknown): OutlineLanguage {
  return value === "es" ? "es" : "en";
}

export function validateOutlineId(value: unknown) {
  const id = typeof value === "string" ? value.trim() : "";
  return isValidUuid(id) ? { value: id } : { error: "That record could not be found." };
}

export function validateGatheringDate(value: unknown) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return { value: null };
  const parsed = new Date(`${text}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== text) {
    return { error: "Date must be a valid date." };
  }
  return { value: text };
}

export function outlineSlug(value: string) {
  const slug = value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/, "");
  return slug || "outline";
}

export function outlineStoragePath(uploadId: string) {
  return `${uploadId}.docx`;
}

export function isValidOutlineStoragePath(path: string) {
  const match = /^([0-9a-f-]{36})\.docx$/i.exec(path);
  return Boolean(match && isValidUuid(match[1]));
}

/** A docx is a ZIP archive: it must start with the "PK" signature. */
export function isDocxMagicBytes(bytes: Uint8Array) {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

/** Suggests a gathering date from a leading YYYYMMDD in the file name; the admin confirms it. */
export function suggestOutlineDate(fileName: string) {
  const match = fileName.match(/^(\d{4})(\d{2})(\d{2})(?!\d)/);
  if (!match) return null;
  const value = `${match[1]}-${match[2]}-${match[3]}`;
  return validateGatheringDate(value).value ?? null;
}
