// Builds small in-memory .docx files for the teaching importer tests.
import { crc32 } from "node:zlib";

const STYLES = [
  ["Normal", "Normal", true],
  ["Title", "Title"],
  ["Subtitle", "Subtitle"],
  ["Heading1", "heading 1"],
  ["Heading2", "heading 2"],
  ["Heading3", "heading 3"],
  ["ScriptureQuote", "Scripture Quote"],
  ["ListBullet", "List Bullet"],
  ["Takeaway", "Takeaway"],
  ["Callout", "Callout"],
  ["Quote", "Quote"],
];

const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"';

function escapeXml(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function stylesXml() {
  const styles = STYLES.map(([id, name, isDefault]) => `<w:style w:type="paragraph"${isDefault ? ' w:default="1"' : ""} w:styleId="${id}"><w:name w:val="${name}"/></w:style>`).join("");
  return `<?xml version="1.0" encoding="UTF-8"?><w:styles ${NS}>${styles}</w:styles>`;
}

/** A run: a string, or { t, b, i, link } where link is a relationship target. */
export function run(spec, links) {
  const item = typeof spec === "string" ? { t: spec } : spec;
  const props = `${item.b ? "<w:b/>" : ""}${item.i ? "<w:i/>" : ""}`;
  const text = `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ""}<w:t xml:space="preserve">${escapeXml(item.t)}</w:t></w:r>`;
  if (!item.link) return text;
  const id = `rId${links.length + 10}`;
  links.push({ id, target: item.link });
  return `<w:hyperlink r:id="${id}">${text}</w:hyperlink>`;
}

/** [styleId, ...runs] for a paragraph; a style of null uses no pStyle (Normal). */
export function paragraph([style, ...runs], links, extra = "") {
  const pPr = style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : "";
  return `<w:p>${pPr}${runs.map((item) => run(item, links)).join("")}${extra}</w:p>`;
}

export function documentXml(paragraphs, { rawBody = "" } = {}) {
  const links = [];
  const body = paragraphs.map((spec) => (typeof spec === "string" ? spec : paragraph(spec, links))).join("");
  return {
    xml: `<?xml version="1.0" encoding="UTF-8"?><w:document ${NS}><w:body>${body}${rawBody}</w:body></w:document>`,
    relationshipsXml: `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${links.map((link) => `<Relationship Id="${link.id}" Type="hyperlink" Target="${escapeXml(link.target)}" TargetMode="External"/>`).join("")}</Relationships>`,
  };
}

/** Parts object for parseTeachingDocxParts. */
export function parts(paragraphs, options = {}) {
  const { xml, relationshipsXml } = documentXml(paragraphs, options);
  return { documentXml: xml, stylesXml: stylesXml(), relationshipsXml, hasComments: options.hasComments ?? false };
}

function zip(entries) {
  const locals = [];
  const centrals = [];
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

export function docxBuffer(paragraphs, options = {}) {
  const { xml, relationshipsXml } = documentXml(paragraphs, options);
  return zip([
    ["[Content_Types].xml", '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>'],
    ["word/document.xml", xml],
    ["word/styles.xml", stylesXml()],
    ["word/_rels/document.xml.rels", relationshipsXml],
  ]);
}

/** A complete, valid teaching used as the base for most tests. */
export function validTeaching() {
  return [
    ["Title", "Treasure in Earthen Vessels: Hearts Made Tender for His Glory"],
    ["Heading1", "Central Theme"],
    [null, "God places eternal treasure in ordinary vessels."],
    ["Heading1", "Introduction"],
    [null, "First introduction paragraph."],
    [null, "Second introduction paragraph."],
    ["Heading1", "Short Summary"],
    [null, "A short summary."],
    ["Heading1", "The Treasure Within the Vessel"],
    ["ScriptureQuote", "2 Corinthians 4:7 (NIV) — “But we have this treasure in jars of clay.”"],
    [null, "An earthen vessel is ", { t: "common", b: true }, " and ", { t: "breakable", i: true }, ", see ", { t: "the site", link: "https://example.com/page" }, "."],
    [null, "A second paragraph in the same run."],
    ["Heading2", "Freedom from Condemnation"],
    [null, "Body under the heading."],
    ["ScriptureQuote", "Romans 8:1 (ESV) — “There is therefore now no condemnation.”"],
    [null, "Text after the scripture."],
    ["Heading1", "Living as a Vessel of His Glory"],
    ["ListBullet", "Look beyond temporary conditions."],
    ["ListBullet", "Reject condemnation."],
    ["Takeaway", "We are ordinary vessels carrying an eternal treasure."],
  ];
}
