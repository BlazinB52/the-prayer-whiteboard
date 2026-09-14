import "server-only";
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

function normalizeInlines(children: WeeklyUpdateInline[]) {
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
  if (merged[0]) merged[0].text = merged[0].text.trimStart();
  if (merged[merged.length - 1]) merged[merged.length - 1].text = merged[merged.length - 1].text.trimEnd();
  return merged.filter((child) => child.text);
}

function paragraphText(children: WeeklyUpdateInline[]) {
  return children.map((child) => child.text).join("").trim();
}

function parseRuns(paragraphXml: string) {
  const children: WeeklyUpdateInline[] = [];
  const runMatches = paragraphXml.match(/<w:r\b[\s\S]*?<\/w:r>/g) ?? [];
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
  return normalizeInlines(children);
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

export function convertDocxToWeeklyUpdate(buffer: Buffer): { blocks: WeeklyUpdateBlock[]; plainText: string } {
  if (buffer.byteLength > MAX_DOCX_BYTES) throw new Error("DOCX file exceeds the 8 MiB limit.");
  const entries = readZipEntries(buffer);
  const documentXml = readZipText(buffer, entries, "word/document.xml");
  if (!documentXml) throw new Error("DOCX document body is missing.");
  const styles = parseStyles(readZipText(buffer, entries, "word/styles.xml"));
  const paragraphs = documentXml.match(/<w:p\b[\s\S]*?<\/w:p>/g) ?? [];
  const blocks: WeeklyUpdateBlock[] = [];

  for (const paragraph of paragraphs) {
    const children = parseRuns(paragraph);
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
      if (block.type === "list") return block.items.map((item) => `- ${paragraphText(item)}`).join("\n");
      return paragraphText(block.children);
    }).join("\n\n"),
  };
}
