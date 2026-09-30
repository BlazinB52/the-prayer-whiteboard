// Minimal, dependency-free .docx reader for the teaching importer: a ZIP
// entry reader plus a small XML tree parser. Deliberately self-contained so it
// can be exercised by plain node tests and shares nothing with other importers.
import { inflateRawSync } from "node:zlib";

export const MAX_TEACHING_DOCX_BYTES = 8 * 1024 * 1024;
const MAX_XML_BYTES = 15 * 1024 * 1024;

export type XmlNode = {
  name: string;
  attrs: Record<string, string>;
  children: XmlNode[];
  text?: string;
};

type ZipEntry = { name: string; method: number; compressedSize: number; uncompressedSize: number; dataOffset: number };

function findEndOfCentralDirectory(buffer: Buffer) {
  const minOffset = Math.max(0, buffer.length - 0xffff - 22);
  for (let offset = buffer.length - 22; offset >= minOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  throw new Error("This file is not a valid .docx document.");
}

function readZipEntries(buffer: Buffer) {
  const end = findEndOfCentralDirectory(buffer);
  const count = buffer.readUInt16LE(end + 10);
  let offset = buffer.readUInt32LE(end + 16);
  const entries = new Map<string, ZipEntry>();

  for (let index = 0; index < count; index += 1) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error("This file is not a valid .docx document.");
    }
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString("utf8", offset + 46, offset + 46 + nameLength);

    if (localOffset + 30 > buffer.length || buffer.readUInt32LE(localOffset) !== 0x04034b50) {
      throw new Error("This file is not a valid .docx document.");
    }
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    entries.set(name, { name, method, compressedSize, uncompressedSize, dataOffset: localOffset + 30 + localNameLength + localExtraLength });
    offset += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}

function readEntryText(buffer: Buffer, entry: ZipEntry) {
  if (entry.uncompressedSize > MAX_XML_BYTES) throw new Error("The .docx document is too large to import.");
  const compressed = buffer.subarray(entry.dataOffset, entry.dataOffset + entry.compressedSize);
  if (compressed.length !== entry.compressedSize) throw new Error("This file is not a valid .docx document.");
  if (entry.method === 0) return compressed.toString("utf8");
  if (entry.method !== 8) throw new Error("This .docx document uses an unsupported compression method.");
  return inflateRawSync(compressed, { maxOutputLength: MAX_XML_BYTES }).toString("utf8");
}

export type DocxPackage = {
  /** Returns the UTF-8 text of a part, or null when the part is absent. */
  readPart(name: string): string | null;
  hasPart(name: string): boolean;
};

export function openDocxPackage(buffer: Buffer): DocxPackage {
  if (buffer.length > MAX_TEACHING_DOCX_BYTES) throw new Error("The .docx file must be 8 MiB or smaller.");
  const entries = readZipEntries(buffer);
  return {
    hasPart: (name) => entries.has(name),
    readPart(name) {
      const entry = entries.get(name);
      return entry ? readEntryText(buffer, entry) : null;
    },
  };
}

const ENTITY_PATTERN = /&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g;

function decodeEntities(value: string) {
  return value.replace(ENTITY_PATTERN, (match, body: string) => {
    if (body === "amp") return "&";
    if (body === "lt") return "<";
    if (body === "gt") return ">";
    if (body === "quot") return '"';
    if (body === "apos") return "'";
    const codePoint = body[1] === "x" ? Number.parseInt(body.slice(2), 16) : Number.parseInt(body.slice(1), 10);
    if (!Number.isFinite(codePoint) || codePoint < 0 || codePoint > 0x10ffff) return match;
    return String.fromCodePoint(codePoint);
  });
}

const ATTRIBUTE_PATTERN = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

/**
 * Parses well-formed XML into a tree. Text nodes are kept as `{ name: "#text" }`
 * children so mixed content stays in document order. Comments, processing
 * instructions, and doctype declarations are skipped.
 */
export function parseXml(source: string): XmlNode {
  const root: XmlNode = { name: "#document", attrs: {}, children: [] };
  const stack: XmlNode[] = [root];
  let index = 0;

  while (index < source.length) {
    const open = source.indexOf("<", index);
    const current = stack[stack.length - 1];

    if (open === -1) {
      const tail = source.slice(index);
      if (tail.trim()) current.children.push({ name: "#text", attrs: {}, children: [], text: decodeEntities(tail) });
      break;
    }
    if (open > index) {
      const text = source.slice(index, open);
      current.children.push({ name: "#text", attrs: {}, children: [], text: decodeEntities(text) });
    }

    if (source.startsWith("<!--", open)) {
      const close = source.indexOf("-->", open + 4);
      if (close === -1) throw new Error("The .docx document XML is malformed.");
      index = close + 3;
      continue;
    }
    if (source.startsWith("<![CDATA[", open)) {
      const close = source.indexOf("]]>", open + 9);
      if (close === -1) throw new Error("The .docx document XML is malformed.");
      current.children.push({ name: "#text", attrs: {}, children: [], text: source.slice(open + 9, close) });
      index = close + 3;
      continue;
    }
    if (source.startsWith("<?", open) || source.startsWith("<!", open)) {
      const close = source.indexOf(">", open + 2);
      if (close === -1) throw new Error("The .docx document XML is malformed.");
      index = close + 1;
      continue;
    }

    const close = source.indexOf(">", open + 1);
    if (close === -1) throw new Error("The .docx document XML is malformed.");
    const tag = source.slice(open + 1, close);
    index = close + 1;

    if (tag.startsWith("/")) {
      if (stack.length > 1) stack.pop();
      continue;
    }

    const selfClosing = tag.endsWith("/");
    const body = selfClosing ? tag.slice(0, -1) : tag;
    const nameMatch = body.match(/^[^\s/]+/);
    if (!nameMatch) throw new Error("The .docx document XML is malformed.");
    const attrs: Record<string, string> = {};
    ATTRIBUTE_PATTERN.lastIndex = 0;
    const attributeSource = body.slice(nameMatch[0].length);
    let attribute: RegExpExecArray | null;
    while ((attribute = ATTRIBUTE_PATTERN.exec(attributeSource)) !== null) {
      attrs[attribute[1]] = decodeEntities(attribute[2] ?? attribute[3] ?? "");
    }

    const node: XmlNode = { name: nameMatch[0], attrs, children: [] };
    current.children.push(node);
    if (!selfClosing) stack.push(node);
  }

  return root;
}

export function childrenNamed(node: XmlNode, name: string) {
  return node.children.filter((child) => child.name === name);
}

export function firstChild(node: XmlNode, name: string) {
  return node.children.find((child) => child.name === name);
}

/** Depth-first search for every descendant with the given element name. */
export function findAll(node: XmlNode, name: string, results: XmlNode[] = []) {
  for (const child of node.children) {
    if (child.name === name) results.push(child);
    findAll(child, name, results);
  }
  return results;
}

export function hasDescendant(node: XmlNode, name: string): boolean {
  return node.children.some((child) => child.name === name || hasDescendant(child, name));
}
