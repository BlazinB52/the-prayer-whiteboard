import { inflateRawSync } from "node:zlib";

export type WeeklyUpdateInline = {
  text: string;
  bold?: boolean;
  italic?: boolean;
};

export type WeeklyUpdateBlock =
  | { type: "paragraph"; children: WeeklyUpdateInline[] }
  | { type: "heading"; level: 2 | 3; children: WeeklyUpdateInline[] }
  | { type: "list"; items: WeeklyUpdateInline[][] }
  | { type: "quote"; children: WeeklyUpdateInline[] }
  | { type: "divider" };

/**
 * What the converter did that the Administrator should know about before publishing. "warning" means
 * the meaning or content may differ from the Word file; "info" is a small formatting difference.
 */
export type ConversionNote = { level: "warning" | "info"; code: string; message: string };
export type ConversionReport = { notes: ConversionNote[] };

type ConversionStats = { linksKept: number; linksLost: number; inferredHeadings: number };

type ZipEntry = {
  name: string;
  compression: number;
  compressedSize: number;
  uncompressedSize: number;
  dataOffset: number;
};

const MAX_DOCX_BYTES = 8 * 1024 * 1024;
const MAX_XML_BYTES = 15 * 1024 * 1024;

function readUInt16(buffer: Buffer, offset: number) {
  return buffer.readUInt16LE(offset);
}

function readUInt32(buffer: Buffer, offset: number) {
  return buffer.readUInt32LE(offset);
}

function findEndOfCentralDirectory(buffer: Buffer) {
  const minOffset = Math.max(0, buffer.length - 0xffff - 22);
  for (let offset = buffer.length - 22; offset >= minOffset; offset -= 1) {
    if (readUInt32(buffer, offset) === 0x06054b50) return offset;
  }
  throw new Error("Invalid DOCX archive.");
}

function readZipEntries(buffer: Buffer) {
  const eocdOffset = findEndOfCentralDirectory(buffer);
  const entryCount = readUInt16(buffer, eocdOffset + 10);
  const centralDirectoryOffset = readUInt32(buffer, eocdOffset + 16);
  const entries = new Map<string, ZipEntry>();
  let offset = centralDirectoryOffset;

  for (let index = 0; index < entryCount; index += 1) {
    if (readUInt32(buffer, offset) !== 0x02014b50) throw new Error("Invalid DOCX central directory.");
    const compression = readUInt16(buffer, offset + 10);
    const compressedSize = readUInt32(buffer, offset + 20);
    const uncompressedSize = readUInt32(buffer, offset + 24);
    const nameLength = readUInt16(buffer, offset + 28);
    const extraLength = readUInt16(buffer, offset + 30);
    const commentLength = readUInt16(buffer, offset + 32);
    const localHeaderOffset = readUInt32(buffer, offset + 42);
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString("utf8");

    if (readUInt32(buffer, localHeaderOffset) !== 0x04034b50) throw new Error("Invalid DOCX local header.");
    const localNameLength = readUInt16(buffer, localHeaderOffset + 26);
    const localExtraLength = readUInt16(buffer, localHeaderOffset + 28);
    entries.set(name, {
      name,
      compression,
      compressedSize,
      uncompressedSize,
      dataOffset: localHeaderOffset + 30 + localNameLength + localExtraLength,
    });
    offset += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}

function readZipText(buffer: Buffer, entries: Map<string, ZipEntry>, name: string) {
  const entry = entries.get(name);
  if (!entry) return null;
  if (entry.uncompressedSize > MAX_XML_BYTES) throw new Error("DOCX XML is too large.");
  const compressed = buffer.subarray(entry.dataOffset, entry.dataOffset + entry.compressedSize);
  const inflated = entry.compression === 0 ? compressed : entry.compression === 8 ? inflateRawSync(compressed) : null;
  if (!inflated) throw new Error("Unsupported DOCX compression method.");
  return inflated.toString("utf8");
}

function decodeXml(value: string) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function stripTags(value: string) {
  return decodeXml(value.replace(/<[^>]+>/g, ""));
}

function attrValue(xml: string, name: string) {
  const match = new RegExp(`${name}="([^"]*)"`, "i").exec(xml);
  return match ? decodeXml(match[1]) : null;
}

function styleId(styleXml: string) {
  return attrValue(styleXml, "w:styleId");
}

function parseStyles(stylesXml: string | null) {
  const styles = new Map<string, string>();
  if (!stylesXml) return styles;
  const matches = stylesXml.match(/<w:style\b[\s\S]*?<\/w:style>/g) ?? [];
  for (const style of matches) {
    const id = styleId(style);
    const name = attrValue(style, "w:val");
    if (id && name) styles.set(id, name.toLowerCase());
  }
  return styles;
}

function paragraphStyle(paragraphXml: string, styles: Map<string, string>) {
  const match = /<w:pStyle\b[^>]*w:val="([^"]+)"/i.exec(paragraphXml);
  if (!match) return "";
  const id = decodeXml(match[1]);
  return styles.get(id) ?? id.toLowerCase();
}

function isOnProperty(runProperties: string, tagName: "b" | "i") {
  const match = new RegExp(`<w:${tagName}\\b([^>]*)\\/?>`, "i").exec(runProperties);
  if (!match) return false;
  return !/w:val="(?:0|false)"/i.test(match[1]);
}

// trimEdges is off for the runs inside a link, so a space at either end of a link's text is kept; the
// paragraph as a whole is trimmed once, after the links are in place.
function normalizeInlines(children: WeeklyUpdateInline[], trimEdges = true) {
  const merged: WeeklyUpdateInline[] = [];
  for (const child of children) {
    const text = child.text.replace(/\s+/g, " ");
    if (!text) continue;
    const previous = merged[merged.length - 1];
    if (previous && Boolean(previous.bold) === Boolean(child.bold) && Boolean(previous.italic) === Boolean(child.italic)) {
      previous.text += text;
    } else {
      merged.push({ ...child, text });
    }
  }
  if (trimEdges && merged[0]) merged[0].text = merged[0].text.trimStart();
  if (trimEdges && merged[merged.length - 1]) merged[merged.length - 1].text = merged[merged.length - 1].text.trimEnd();
  return merged.filter((child) => child.text);
}

function paragraphText(children: WeeklyUpdateInline[]) {
  return children.map((child) => child.text).join("").trim();
}

// Only web addresses are kept as links, the same rule the rest of the site uses. Characters that would
// end a link early in the stored [text](address) form are percent-encoded.
function safeHttpUrl(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (!/^https?:\/\//i.test(raw)) return null;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  } catch {
    return null;
  }
  return raw.replace(/\s/g, "%20").replace(/\(/g, "%28").replace(/\)/g, "%29");
}

// Wraps text in the stored link form the website and email already understand, keeping any spaces
// at either end outside the brackets.
function wrapLink(text: string, url: string) {
  const parts = /^(\s*)([\s\S]*?)(\s*)$/.exec(text);
  const label = (parts?.[2] ?? text).replace(/\[/g, "(").replace(/\]/g, ")").replace(/\s+/g, " ");
  if (!label) return text;
  return `${parts?.[1] ?? ""}[${label}](${url})${parts?.[3] ?? ""}`;
}

const STORED_LINK = /\[([^\]\n]+)\]\(([^\s)]+)\)/g;

// The plain-text version reads "label (address)" instead of the stored form.
function plainLinks(text: string) {
  return text.replace(STORED_LINK, (_match, label: string, url: string) => (label === url ? url : `${label} (${url})`));
}

// Word sometimes splits one link into neighbouring links to the same address. They read as one link.
function mergeAdjacentLinks(text: string) {
  let current = text;
  for (let pass = 0; pass < 20; pass += 1) {
    const next = current.replace(/\[([^\]\n]+)\]\(([^\s)]+)\)(\s*)\[([^\]\n]+)\]\(\2\)/g, "[$1$3$4]($2)");
    if (next === current) break;
    current = next;
  }
  return current;
}

function parseRelationships(xml: string | null) {
  const links = new Map<string, string>();
  if (!xml) return links;
  for (const relationship of xml.match(/<Relationship\b[^>]*>/g) ?? []) {
    const id = attrValue(relationship, "Id");
    const type = attrValue(relationship, "Type");
    const target = attrValue(relationship, "Target");
    if (id && target && type && /hyperlink$/i.test(type)) links.set(id, target);
  }
  return links;
}

function parseRuns(paragraphXml: string, links: Map<string, string>, stats: ConversionStats) {
  const children: WeeklyUpdateInline[] = [];
  // A hyperlink wraps its own runs; anything else is a plain run. The alternation consumes a whole
  // hyperlink first, so its inner runs are never read twice.
  const tokens = paragraphXml.match(/<w:hyperlink\b[^>]*>[\s\S]*?<\/w:hyperlink>|<w:r\b[\s\S]*?<\/w:r>/g) ?? [];
  for (const token of tokens) {
    if (!token.startsWith("<w:hyperlink")) {
      children.push(...extractRuns(token));
      continue;
    }
    const inner = normalizeInlines(extractRuns(token), false);
    if (!inner.length) continue;
    const relationshipId = attrValue(token.slice(0, token.indexOf(">")), "r:id");
    const url = relationshipId ? safeHttpUrl(links.get(relationshipId)) : null;
    if (url) {
      stats.linksKept += 1;
      for (const part of inner) children.push({ ...part, text: wrapLink(part.text, url) });
    } else {
      stats.linksLost += 1;
      children.push(...inner);
    }
  }
  return normalizeInlines(children).map((child) => ({ ...child, text: mergeAdjacentLinks(child.text) }));
}

function extractRuns(xml: string) {
  const children: WeeklyUpdateInline[] = [];
  const runMatches = xml.match(/<w:r\b[\s\S]*?<\/w:r>/g) ?? [];
  for (const run of runMatches) {
    if (/<w:br\b[^>]*w:type="page"/i.test(run)) continue;
    const runProperties = /<w:rPr\b[\s\S]*?<\/w:rPr>/i.exec(run)?.[0] ?? "";
    const bold = isOnProperty(runProperties, "b");
    const italic = isOnProperty(runProperties, "i");
    const textMatches = run.match(/<w:t\b[^>]*>[\s\S]*?<\/w:t>|<w:tab\s*\/>|<w:br\s*\/>/g) ?? [];
    for (const part of textMatches) {
      if (/^<w:tab/i.test(part)) {
        children.push({ text: " ", bold, italic });
      } else if (/^<w:br/i.test(part)) {
        children.push({ text: "\n", bold, italic });
      } else {
        children.push({ text: stripTags(part), bold, italic });
      }
    }
  }
  return children;
}

function isDivider(paragraphXml: string, text: string) {
  return /^[-_*]{3,}$/.test(text.replace(/\s+/g, "")) || /<w:pBdr\b[\s\S]*?<w:bottom\b/i.test(paragraphXml);
}

function isList(paragraphXml: string, style: string) {
  return /<w:numPr\b/i.test(paragraphXml) || /\blist\b/.test(style);
}

function isQuote(style: string) {
  return /\bquote\b/.test(style);
}

function headingLevel(style: string): 2 | 3 | null {
  if (/heading\s*1|heading1|title/.test(style)) return 2;
  if (/heading\s*2|heading2|subtitle/.test(style)) return 3;
  return null;
}

const MAX_INFERRED_HEADING_LENGTH = 80;

// Fallback for section titles that were never given a real "Heading" paragraph
// style — just bolded a short title line, which is common after pasting or
// autoformatting in Word. Detected by structure/boldness rather than a
// specific point size, since the literal font size on these runs varies.
function looksLikeInferredHeading(children: WeeklyUpdateInline[], text: string) {
  if (!children.length) return false;
  if (text.length > MAX_INFERRED_HEADING_LENGTH) return false;
  if (/[.!?]\s*$/.test(text)) return false;
  return children.every((child) => child.bold && child.text.trim());
}

function count(pattern: RegExp, text: string) {
  return (text.match(pattern) ?? []).length;
}

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

function buildReport(documentXml: string, numberingXml: string | null, hasComments: boolean, stats: ConversionStats): ConversionReport {
  const notes: ConversionNote[] = [];
  const insertions = count(/<w:(?:ins|moveTo)\b/g, documentXml);
  const deletions = count(/<w:(?:del|moveFrom)\b/g, documentXml);
  if (insertions + deletions > 0) {
    notes.push({
      level: "warning",
      code: "tracked_changes",
      message: `This document still has unresolved tracked changes (${plural(insertions, "insertion", "insertions")}, ${plural(deletions, "deletion", "deletions")}). The text was converted as if every change had been accepted: inserted wording is included and deleted wording is left out. If that is not what you want, open the file in Word, use Review > Accept All (or reject the ones you do not want), and upload it again.`,
    });
  }
  if (stats.linksLost > 0) {
    notes.push({ level: "warning", code: "links_lost", message: `${plural(stats.linksLost, "link was", "links were")} not kept. Only web addresses that start with http:// or https:// can be links; email links and links to other places in the document become plain words.` });
  }
  const fieldLinks = count(/<w:instrText\b[^>]*>\s*HYPERLINK\b/gi, documentXml);
  if (fieldLinks > 0) {
    notes.push({ level: "warning", code: "field_links", message: `${plural(fieldLinks, "link is", "links are")} stored in an older Word style and could not be kept. Re-insert ${fieldLinks === 1 ? "it" : "them"} in Word (Insert > Link) and upload again.` });
  }
  const images = count(/<w:(?:drawing|pict|object)\b/g, documentXml);
  if (images > 0) {
    notes.push({ level: "warning", code: "images", message: `${plural(images, "picture or drawing is", "pictures or drawings are")} not included. A weekly update's picture is chosen separately, in the chalkboard list above.` });
  }
  const tables = count(/<w:tbl\b/g, documentXml);
  if (tables > 0) {
    notes.push({ level: "warning", code: "tables", message: `${plural(tables, "table was", "tables were")} flattened: each cell now appears as its own paragraph, with no grid.` });
  }
  const numbered = numberingXml ? /<w:numFmt\b[^>]*w:val="(?!bullet|none)[^"]*"/i.test(numberingXml) : false;
  const nested = /<w:ilvl\b[^>]*w:val="[1-9]/.test(documentXml);
  if (nested || (numbered && /<w:numPr\b/.test(documentXml))) {
    notes.push({ level: "warning", code: "lists", message: "Lists are shown as one bulleted list. Numbers and sub-items (indented levels) are not kept." });
  }
  const notesCount = count(/<w:(?:footnoteReference|endnoteReference)\b/g, documentXml);
  if (notesCount > 0) {
    notes.push({ level: "warning", code: "footnotes", message: `${plural(notesCount, "footnote or endnote is", "footnotes or endnotes are")} not included.` });
  }
  if (/<w:txbxContent\b/.test(documentXml)) {
    notes.push({ level: "warning", code: "text_boxes", message: "This document has text boxes. Their text may appear out of place or twice." });
  }
  if (stats.inferredHeadings > 0) {
    notes.push({ level: "info", code: "inferred_headings", message: `${plural(stats.inferredHeadings, "short bold line was", "short bold lines were")} shown as a heading because it was not given a Heading style in Word.` });
  }
  if (/<w:u\b[^>]*w:val="(?!none)[^"]*"/.test(documentXml) || /<w:color\b[^>]*w:val="(?!auto|000000)[^"]+"/i.test(documentXml) || /<w:highlight\b/.test(documentXml)) {
    notes.push({ level: "info", code: "formatting", message: "Underlining, text colors and highlighting are not kept. Bold and italics are." });
  }
  if (hasComments) {
    notes.push({ level: "info", code: "comments", message: "Word comments are ignored and do not appear." });
  }
  notes.sort((a, b) => (a.level === b.level ? 0 : a.level === "warning" ? -1 : 1));
  return { notes };
}

export function convertDocxToWeeklyUpdate(buffer: Buffer): { blocks: WeeklyUpdateBlock[]; plainText: string; report: ConversionReport } {
  if (buffer.byteLength > MAX_DOCX_BYTES) throw new Error("DOCX file exceeds the 8 MiB limit.");
  const entries = readZipEntries(buffer);
  const documentXml = readZipText(buffer, entries, "word/document.xml");
  if (!documentXml) throw new Error("DOCX document body is missing.");
  const styles = parseStyles(readZipText(buffer, entries, "word/styles.xml"));
  const links = parseRelationships(readZipText(buffer, entries, "word/_rels/document.xml.rels"));
  const numberingXml = readZipText(buffer, entries, "word/numbering.xml");
  const stats: ConversionStats = { linksKept: 0, linksLost: 0, inferredHeadings: 0 };
  const paragraphs = documentXml.match(/<w:p\b[\s\S]*?<\/w:p>/g) ?? [];
  const blocks: WeeklyUpdateBlock[] = [];

  for (const paragraph of paragraphs) {
    const children = parseRuns(paragraph, links, stats);
    const text = paragraphText(children);
    if (!text) continue;

    const style = paragraphStyle(paragraph, styles);
    if (isDivider(paragraph, text)) {
      blocks.push({ type: "divider" });
      continue;
    }

    if (isList(paragraph, style)) {
      const previous = blocks[blocks.length - 1];
      if (previous?.type === "list") {
        previous.items.push(children);
      } else {
        blocks.push({ type: "list", items: [children] });
      }
      continue;
    }

    const level = headingLevel(style);
    if (level) {
      blocks.push({ type: "heading", level, children });
      continue;
    }

    if (looksLikeInferredHeading(children, text)) {
      stats.inferredHeadings += 1;
      blocks.push({ type: "heading", level: 3, children });
      continue;
    }

    if (isQuote(style)) {
      blocks.push({ type: "quote", children });
      continue;
    }

    blocks.push({ type: "paragraph", children });
  }

  if (!blocks.length) throw new Error("No readable weekly update content was found in the DOCX.");
  return {
    blocks,
    plainText: blocks.map((block) => {
      if (block.type === "divider") return "---";
      if (block.type === "list") return block.items.map((item) => `- ${plainLinks(paragraphText(item))}`).join("\n");
      return plainLinks(paragraphText(block.children));
    }).join("\n\n"),
    report: buildReport(documentXml, numberingXml, entries.has("word/comments.xml"), stats),
  };
}
