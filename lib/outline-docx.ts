// Export a teaching outline to a styled Word file, and the strict checks that decide whether an edited copy of that file may
// replace the outline again. The export uses the same Word styles the outline upload already reads (Title, Subtitle, Heading 1-3,
// list numbering, tables), so a file written here reads back into exactly the blocks it was made from.
//
// The file carries a marker (in the Word "Tags" property) naming the outline and a fingerprint of the text it was made from.
// An import is allowed only when the marker matches this outline and the outline has not changed since, and the document has
// exactly the same structure: same number and kind of blocks, same heading levels, same list items at the same levels, same
// table shape. Only wording and bold / italic / links may differ. Nothing here touches the database.
import { writeZip } from "./handout-docx/zip.ts";
import { openDocxPackage, findAll, parseXml } from "./teaching-docx-package.ts";
import type { OutlineBlock, OutlineInline } from "./teaching-outlines.ts";

const MARKER_PREFIX = "tpw-outline";

// --- text helpers -----------------------------------------------------------

function escapeXml(value: string) {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Adjacent runs with the same formatting joined, empty runs dropped: the shape the outline parser produces. */
export function normalizeInlines(inlines: OutlineInline[]): OutlineInline[] {
  const merged: OutlineInline[] = [];
  for (const inline of inlines) {
    if (!inline.text) continue;
    const next: OutlineInline = { text: inline.text };
    if (inline.bold) next.bold = true;
    if (inline.italic) next.italic = true;
    if (inline.href) next.href = inline.href;
    const last = merged[merged.length - 1];
    if (last && last.bold === next.bold && last.italic === next.italic && last.href === next.href) last.text += next.text;
    else merged.push(next);
  }
  return merged;
}

// Whitespace differences (stray line breaks, doubled spaces, spaces at the ends) are not changes: Word cannot hold them
// and the importer collapses them.
function inlineKey(inlines: OutlineInline[]) {
  const runs = normalizeInlines(inlines.map((inline) => ({ ...inline, text: inline.text.replace(/\s+/g, " ") })));
  if (runs.length) {
    runs[0] = { ...runs[0], text: runs[0].text.replace(/^ /, "") };
    runs[runs.length - 1] = { ...runs[runs.length - 1], text: runs[runs.length - 1].text.replace(/ $/, "") };
  }
  return runs
    .filter((inline) => inline.text)
    .map((inline) => `${inline.bold ? "b" : ""}${inline.italic ? "i" : ""}${inline.href ? `@${inline.href}@` : ""}:${inline.text}`)
    .join("\u0001");
}

function plain(inlines: OutlineInline[]) {
  return inlines.map((inline) => inline.text).join("");
}

function snippet(inlines: OutlineInline[]) {
  const text = plain(inlines).replace(/\s+/g, " ").trim();
  return text.length > 48 ? `${text.slice(0, 45)}...` : text;
}

/** The parser joins list paragraphs that follow each other into one list, so two list blocks in a row count as one. */
export function mergeAdjacentLists(blocks: OutlineBlock[]): OutlineBlock[] {
  const merged: OutlineBlock[] = [];
  for (const block of blocks) {
    const last = merged[merged.length - 1];
    if (block.type === "list" && last?.type === "list") merged[merged.length - 1] = { type: "list", items: [...last.items, ...block.items] };
    else merged.push(block);
  }
  return merged;
}

// --- the marker -------------------------------------------------------------

export function outlineMarker(outlineId: string, hash: string) {
  return `${MARKER_PREFIX}:${outlineId}:${hash}`;
}

/** The outline id and fingerprint a file was exported with, or null when the file has no marker. */
export function readOutlineMarker(buffer: Buffer): { outlineId: string; hash: string } | null {
  try {
    const core = openDocxPackage(buffer).readPart("docProps/core.xml");
    if (!core) return null;
    for (const node of findAll(parseXml(core), "cp:keywords")) {
      const text = node.children.map((child) => child.text ?? "").join("").trim();
      const match = new RegExp(`${MARKER_PREFIX}:([0-9a-f-]{36}):([0-9a-f]{32})`, "i").exec(text);
      if (match) return { outlineId: match[1].toLowerCase(), hash: match[2].toLowerCase() };
    }
    return null;
  } catch {
    return null;
  }
}

// --- writing the Word file ---------------------------------------------------

const W_NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="en-US"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="80"/></w:pPr><w:rPr><w:b/><w:color w:val="243D31"/><w:sz w:val="44"/><w:szCs w:val="44"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="240"/></w:pPr><w:rPr><w:caps/><w:color w:val="607066"/><w:spacing w:val="10"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="320" w:after="120"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:color w:val="243D31"/><w:sz w:val="32"/><w:szCs w:val="32"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="100"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:color w:val="385245"/><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="200" w:after="80"/><w:outlineLvl w:val="2"/></w:pPr><w:rPr><w:b/><w:color w:val="946332"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="60"/></w:pPr></w:style>
<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>
<w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/><w:basedOn w:val="TableNormal"/><w:tblPr><w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="9AA79F"/><w:left w:val="single" w:sz="4" w:space="0" w:color="9AA79F"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="9AA79F"/><w:right w:val="single" w:sz="4" w:space="0" w:color="9AA79F"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="9AA79F"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="9AA79F"/></w:tblBorders></w:tblPr></w:style>
</w:styles>`;

const BULLET_TEXT = ["•", "–", "•", "–"];
const ORDERED_FORMATS = [
  ["decimal", "%1."],
  ["lowerLetter", "%2."],
  ["lowerRoman", "%3."],
  ["decimal", "%4."],
] as const;

function abstractNum(id: number, kind: "bullet" | "ordered") {
  const levels = [0, 1, 2, 3]
    .map((level) => {
      const [format, text] = kind === "bullet" ? ["bullet", BULLET_TEXT[level]] : ORDERED_FORMATS[level];
      return `<w:lvl w:ilvl="${level}"><w:start w:val="1"/><w:numFmt w:val="${format}"/><w:lvlText w:val="${text}"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="${720 * (level + 1)}" w:hanging="360"/></w:pPr></w:lvl>`;
    })
    .join("");
  return `<w:abstractNum w:abstractNumId="${id}"><w:multiLevelType w:val="hybridMultilevel"/>${levels}</w:abstractNum>`;
}

type Builder = {
  hyperlinks: Map<string, string>;
  nums: string[];
  orderedNumIds: number[];
};

function runXml(inline: OutlineInline, builder: Builder) {
  const properties = [inline.bold ? "<w:b/>" : "", inline.italic ? "<w:i/>" : "", inline.href ? '<w:color w:val="0563C1"/><w:u w:val="single"/>' : ""].join("");
  const run = `<w:r>${properties ? `<w:rPr>${properties}</w:rPr>` : ""}<w:t xml:space="preserve">${escapeXml(inline.text)}</w:t></w:r>`;
  if (!inline.href) return run;
  let id = builder.hyperlinks.get(inline.href);
  if (!id) {
    id = `rIdLink${builder.hyperlinks.size + 1}`;
    builder.hyperlinks.set(inline.href, id);
  }
  return `<w:hyperlink r:id="${id}" w:history="1">${run}</w:hyperlink>`;
}

function paragraphXml(inlines: OutlineInline[], builder: Builder, style?: string, numbering?: { level: number; numId: number }) {
  const properties = [style ? `<w:pStyle w:val="${style}"/>` : "", numbering ? `<w:numPr><w:ilvl w:val="${numbering.level}"/><w:numId w:val="${numbering.numId}"/></w:numPr>` : ""].join("");
  return `<w:p>${properties ? `<w:pPr>${properties}</w:pPr>` : ""}${normalizeInlines(inlines).map((inline) => runXml(inline, builder)).join("")}</w:p>`;
}

function tableXml(rows: OutlineInline[][][], builder: Builder) {
  const columns = Math.max(1, ...rows.map((row) => row.length));
  const width = Math.floor(9360 / columns);
  const grid = Array.from({ length: columns }, () => `<w:gridCol w:w="${width}"/>`).join("");
  const body = rows
    .map(
      (row) =>
        `<w:tr>${row
          .map((cell) => `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/></w:tcPr>${paragraphXml(cell, builder)}</w:tc>`)
          .join("")}</w:tr>`,
    )
    .join("");
  // The empty paragraph after a table keeps two tables from joining in Word. The importer ignores empty paragraphs.
  return `<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="0" w:type="auto"/></w:tblPr><w:tblGrid>${grid}</w:tblGrid>${body}</w:tbl><w:p/>`;
}

export function buildOutlineDocx(input: { outlineId: string; hash: string; title: string; subtitle: string | null; blocks: OutlineBlock[] }): Buffer {
  const builder: Builder = { hyperlinks: new Map(), nums: [], orderedNumIds: [] };
  // Numbered lists get their own numbering instance, so each one starts again at 1.
  let nextNumId = 3;

  const body: string[] = [paragraphXml([{ text: input.title }], builder, "Title")];
  if (input.subtitle) body.push(paragraphXml([{ text: input.subtitle }], builder, "Subtitle"));

  for (const block of mergeAdjacentLists(input.blocks)) {
    if (block.type === "heading") body.push(paragraphXml(block.inlines, builder, `Heading${block.level}`));
    else if (block.type === "paragraph") body.push(paragraphXml(block.inlines, builder));
    else if (block.type === "table") body.push(tableXml(block.rows, builder));
    else {
      let orderedNumId: number | null = null;
      for (const item of block.items) {
        let numId = 1;
        if (item.ordered) {
          if (orderedNumId === null) {
            orderedNumId = nextNumId++;
            builder.nums.push(
              `<w:num w:numId="${orderedNumId}"><w:abstractNumId w:val="1"/>${[0, 1, 2, 3].map((level) => `<w:lvlOverride w:ilvl="${level}"><w:startOverride w:val="1"/></w:lvlOverride>`).join("")}</w:num>`,
            );
          }
          numId = orderedNumId;
        }
        body.push(paragraphXml(item.inlines, builder, "ListParagraph", { level: Math.max(0, Math.min(3, item.level)), numId }));
      }
    }
  }

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document ${W_NS}><w:body>${body.join("")}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body></w:document>`;

  const numberingXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${abstractNum(0, "bullet")}${abstractNum(1, "ordered")}<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num><w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num>${builder.nums.join("")}</w:numbering>`;

  const documentRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rIdNumbering" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>${[...builder.hyperlinks]
    .map(([href, id]) => `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${escapeXml(href)}" TargetMode="External"/>`)
    .join("")}</Relationships>`;

  const core = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${escapeXml(input.title)}</dc:title><cp:keywords>${escapeXml(outlineMarker(input.outlineId, input.hash))}</cp:keywords></cp:coreProperties>`;

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`;

  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`;

  const parts = new Map<string, Buffer>([
    ["[Content_Types].xml", Buffer.from(contentTypes, "utf8")],
    ["_rels/.rels", Buffer.from(rootRels, "utf8")],
    ["docProps/core.xml", Buffer.from(core, "utf8")],
    ["word/document.xml", Buffer.from(documentXml, "utf8")],
    ["word/_rels/document.xml.rels", Buffer.from(documentRels, "utf8")],
    ["word/styles.xml", Buffer.from(STYLES_XML, "utf8")],
    ["word/numbering.xml", Buffer.from(numberingXml, "utf8")],
  ]);
  return writeZip(parts);
}

// --- the strict structure check ------------------------------------------------

function describeBlock(block: OutlineBlock | undefined) {
  if (!block) return "nothing";
  if (block.type === "heading") return `a heading (level ${block.level})`;
  if (block.type === "paragraph") return "a paragraph";
  if (block.type === "list") return `a list of ${block.items.length} item${block.items.length === 1 ? "" : "s"}`;
  return `a table of ${block.rows.length} row${block.rows.length === 1 ? "" : "s"}`;
}

function nearText(block: OutlineBlock | undefined) {
  if (!block) return "";
  const first = block.type === "list" ? block.items[0]?.inlines : block.type === "table" ? block.rows[0]?.[0] : block.inlines;
  const text = first ? snippet(first) : "";
  return text ? ` near "${text}"` : "";
}

function listShape(block: Extract<OutlineBlock, { type: "list" }>) {
  return block.items.map((item) => `${Math.min(3, Math.max(0, item.level))}${item.ordered ? "n" : "b"}`).join(",");
}

function sameKind(a: OutlineBlock, b: OutlineBlock) {
  if (a.type !== b.type) return false;
  if (a.type === "heading" && b.type === "heading") return a.level === b.level;
  return true;
}

/**
 * Compares the document's blocks with the outline's current blocks and returns every way the structure differs, in plain words.
 * An empty list means the structure is identical and only wording and formatting may differ.
 */
export function compareOutlineStructure(current: OutlineBlock[], incoming: OutlineBlock[]): string[] {
  const before = mergeAdjacentLists(current);
  const after = mergeAdjacentLists(incoming);
  const problems: string[] = [];

  if (before.length !== after.length) {
    let at = 0;
    while (at < before.length && at < after.length && sameKind(before[at], after[at])) at += 1;
    problems.push(
      `The outline has ${before.length} blocks (paragraphs, headings, lists and tables) but the document has ${after.length}. ` +
        `A paragraph, heading, list or table was added, removed or emptied. The first difference is at block ${at + 1}: the outline has ${describeBlock(before[at])}${nearText(before[at])}, the document has ${describeBlock(after[at])}${nearText(after[at])}.`,
    );
    return problems;
  }

  for (let index = 0; index < before.length && problems.length < 8; index += 1) {
    const a = before[index];
    const b = after[index];
    const where = `Block ${index + 1}${nearText(a)}`;
    if (!sameKind(a, b)) {
      problems.push(`${where}: the outline has ${describeBlock(a)} but the document has ${describeBlock(b)}.`);
    } else if (a.type === "list" && b.type === "list") {
      if (a.items.length !== b.items.length) problems.push(`${where}: the list has ${a.items.length} item${a.items.length === 1 ? "" : "s"} but the document has ${b.items.length}.`);
      else if (listShape(a) !== listShape(b)) problems.push(`${where}: a list item has a different indent level or bullet/number type.`);
    } else if (a.type === "table" && b.type === "table") {
      const shapeA = a.rows.map((row) => row.length).join(",");
      const shapeB = b.rows.map((row) => row.length).join(",");
      if (shapeA !== shapeB) problems.push(`${where}: the table has a different number of rows or cells.`);
    }
  }
  return problems;
}

// --- what would change ---------------------------------------------------------

export type OutlineChange = { where: string; before: string; after: string };

/** The wording that differs between two outlines of the same structure, one entry per paragraph, item or cell. */
export function listOutlineChanges(current: OutlineBlock[], incoming: OutlineBlock[]): OutlineChange[] {
  const before = mergeAdjacentLists(current);
  const after = mergeAdjacentLists(incoming);
  const changes: OutlineChange[] = [];
  const note = (where: string, a: OutlineInline[], b: OutlineInline[]) => {
    if (inlineKey(a) !== inlineKey(b)) changes.push({ where, before: snippet(a), after: snippet(b) });
  };
  for (let index = 0; index < Math.min(before.length, after.length); index += 1) {
    const a = before[index];
    const b = after[index];
    const label = `Block ${index + 1}`;
    if ((a.type === "heading" || a.type === "paragraph") && (b.type === "heading" || b.type === "paragraph")) note(label, a.inlines, b.inlines);
    else if (a.type === "list" && b.type === "list") a.items.forEach((item, at) => b.items[at] && note(`${label}, item ${at + 1}`, item.inlines, b.items[at].inlines));
    else if (a.type === "table" && b.type === "table") {
      a.rows.forEach((row, r) => row.forEach((cell, c) => b.rows[r]?.[c] && note(`${label}, row ${r + 1} cell ${c + 1}`, cell, b.rows[r][c])));
    }
  }
  return changes;
}
