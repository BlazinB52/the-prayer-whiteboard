// Writes small, valid Word (.docx) files with no outside library: the paragraph styles the teaching importer
// reads, real bullets, hyperlinks, and document properties. Used for the downloadable Word template and for the
// "Export for translation" files, so both always carry exactly the styles the importer expects.

export const W_NAMESPACES = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const FONT = "Calibri";

export function escapeXml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

type StyleInput = { id: string; name: string; isDefault?: boolean; basedOn?: string; next?: string; custom?: boolean; ppr?: string; rpr?: string; priority?: number };

function style({ id, name, isDefault = false, basedOn = "Normal", next = "Normal", custom = false, ppr = "", rpr = "", priority = 1 }: StyleInput) {
  return `<w:style w:type="paragraph"${isDefault ? ' w:default="1"' : ""}${custom ? ' w:customStyle="1"' : ""} w:styleId="${id}"><w:name w:val="${name}"/>${isDefault ? "" : `<w:basedOn w:val="${basedOn}"/>`}<w:next w:val="${next}"/><w:uiPriority w:val="${priority}"/><w:qFormat/>${ppr ? `<w:pPr>${ppr}</w:pPr>` : ""}${rpr ? `<w:rPr>${rpr}</w:rPr>` : ""}</w:style>`;
}

/** The styles the teaching importer names: Title, Heading 1, Heading 2, Normal, Scripture Quote, List Bullet, Quote, Takeaway. */
export function stylesXml(language = "en-US") {
  const styles = [
    style({ id: "Normal", name: "Normal", isDefault: true, ppr: '<w:spacing w:after="140" w:line="276" w:lineRule="auto"/>', priority: 0 }),
    style({ id: "Title", name: "Title", ppr: '<w:keepNext/><w:spacing w:before="0" w:after="200"/>', rpr: '<w:b/><w:color w:val="243D31"/><w:sz w:val="48"/><w:szCs w:val="48"/>', priority: 10 }),
    style({ id: "Heading1", name: "heading 1", ppr: '<w:keepNext/><w:spacing w:before="320" w:after="120"/><w:outlineLvl w:val="0"/>', rpr: '<w:b/><w:color w:val="244A3A"/><w:sz w:val="34"/><w:szCs w:val="34"/>', priority: 9 }),
    style({ id: "Heading2", name: "heading 2", ppr: '<w:keepNext/><w:spacing w:before="240" w:after="100"/><w:outlineLvl w:val="1"/>', rpr: '<w:b/><w:color w:val="946332"/><w:sz w:val="28"/><w:szCs w:val="28"/>', priority: 9 }),
    style({ id: "ScriptureQuote", name: "Scripture Quote", custom: true, ppr: '<w:spacing w:before="120" w:after="160"/><w:ind w:left="360" w:right="360"/>', rpr: '<w:color w:val="385245"/>', priority: 20 }),
    style({ id: "ListBullet", name: "List Bullet", ppr: '<w:numPr><w:numId w:val="1"/></w:numPr><w:spacing w:after="80"/><w:ind w:left="720" w:hanging="360"/><w:contextualSpacing/>', priority: 36 }),
    style({ id: "Quote", name: "Quote", custom: true, ppr: '<w:pBdr><w:left w:val="single" w:sz="24" w:space="8" w:color="C99A52"/></w:pBdr><w:spacing w:before="120" w:after="160"/><w:ind w:left="480"/>', priority: 20 }),
    style({ id: "Takeaway", name: "Takeaway", custom: true, ppr: '<w:pBdr><w:left w:val="single" w:sz="24" w:space="8" w:color="D9B24D"/></w:pBdr><w:spacing w:before="120" w:after="160"/><w:ind w:left="240"/>', rpr: "<w:b/>", priority: 20 }),
  ].join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ${W_NAMESPACES}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${FONT}" w:hAnsi="${FONT}" w:eastAsia="${FONT}" w:cs="${FONT}"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="${language}"/></w:rPr></w:rPrDefault></w:docDefaults>${styles}</w:styles>`;
}

export function numberingXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering ${W_NAMESPACES}><w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="hybridMultilevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr><w:rPr><w:rFonts w:ascii="${FONT}" w:hAnsi="${FONT}"/></w:rPr></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>`;
}

export function run(text: string, { b = false, i = false }: { b?: boolean; i?: boolean } = {}) {
  return `<w:r>${b || i ? `<w:rPr>${b ? "<w:b/>" : ""}${i ? "<w:i/>" : ""}</w:rPr>` : ""}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>`;
}

export function para(styleId: string | null, ...runs: string[]) {
  return `<w:p>${styleId ? `<w:pPr><w:pStyle w:val="${styleId}"/></w:pPr>` : ""}${runs.join("")}</w:p>`;
}

// ---- zip (stored, no compression) ----

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(data: Buffer) {
  let crc = 0xffffffff;
  for (const byte of data) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export function zip(entries: [string, string][]) {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of entries) {
    const data = Buffer.from(content, "utf8");
    const nameBuffer = Buffer.from(name, "utf8");
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuffer.length, 26);
    locals.push(local, nameBuffer, data);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuffer.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuffer);
    offset += local.length + nameBuffer.length + data.length;
  }
  const centralBuffer = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuffer.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBuffer, end]);
}

// ---- the package ----

export type DocxPackageInput = {
  /** The body paragraphs, already written as WordprocessingML. */
  bodyXml: string;
  /** External web links used in the body, by relationship id (rId10, rId11, ...). */
  hyperlinks?: { id: string; url: string }[];
  /** Document properties. description shows as Comments in Word's File > Info. */
  core?: { title?: string; description?: string };
  /** Custom document properties (a name and a text value each). */
  custom?: Record<string, string>;
  language?: string;
};

const CT = "application/vnd.openxmlformats-officedocument.wordprocessingml";
const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const SECTION = '<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>';

export function buildDocxPackage(input: DocxPackageInput): Buffer {
  const hasCore = Boolean(input.core && (input.core.title || input.core.description));
  const customEntries = Object.entries(input.custom ?? {});
  const hasCustom = customEntries.length > 0;

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="${CT}.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="${CT}.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="${CT}.numbering+xml"/>${hasCore ? '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' : ""}${hasCustom ? '<Override PartName="/docProps/custom.xml" ContentType="application/vnd.openxmlformats-officedocument.custom-properties+xml"/>' : ""}</Types>`;

  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="word/document.xml"/>${hasCore ? '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' : ""}${hasCustom ? `<Relationship Id="rId3" Type="${REL}/custom-properties" Target="docProps/custom.xml"/>` : ""}</Relationships>`;

  const hyperlinkRels = (input.hyperlinks ?? []).map((link) => `<Relationship Id="${link.id}" Type="${REL}/hyperlink" Target="${escapeXml(link.url)}" TargetMode="External"/>`).join("");
  const documentRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/styles" Target="styles.xml"/><Relationship Id="rId2" Type="${REL}/numbering" Target="numbering.xml"/>${hyperlinkRels}</Relationships>`;

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${W_NAMESPACES}><w:body>${input.bodyXml}${SECTION}</w:body></w:document>`;

  const entries: [string, string][] = [
    ["[Content_Types].xml", contentTypes],
    ["_rels/.rels", rootRels],
    ["word/document.xml", documentXml],
    ["word/_rels/document.xml.rels", documentRels],
    ["word/styles.xml", stylesXml(input.language)],
    ["word/numbering.xml", numberingXml()],
  ];

  if (hasCore) {
    entries.push(["docProps/core.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">${input.core?.title ? `<dc:title>${escapeXml(input.core.title)}</dc:title>` : ""}${input.core?.description ? `<dc:description>${escapeXml(input.core.description)}</dc:description>` : ""}</cp:coreProperties>`]);
  }
  if (hasCustom) {
    const properties = customEntries.map(([name, value], index) => `<property fmtid="{D5CDD505-2E9C-101B-9397-08002B2CF9AE}" pid="${index + 2}" name="${escapeXml(name)}"><vt:lpwstr>${escapeXml(value)}</vt:lpwstr></property>`).join("");
    entries.push(["docProps/custom.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">${properties}</Properties>`]);
  }
  return zip(entries);
}
