#!/usr/bin/env node

// Builds the companion Word starter file for the Teaching DOCX importer. It
// installs the exact styles the import rules name (Title, Heading 1, Heading 2,
// Normal, Scripture Quote, List Bullet, Takeaway) with real Word bullets, and
// contains a short sample teaching that passes the importer.
//
//   node scripts/build-teaching-import-template.mjs [output-path]

import { writeFileSync } from "node:fs";
import { crc32 } from "node:zlib";
import { pathToFileURL } from "node:url";

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const FONT = "Calibri";
const escapeXml = (value) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function style({ id, name, isDefault = false, basedOn = "Normal", next = "Normal", custom = false, ppr = "", rpr = "", priority = 1 }) {
  return `<w:style w:type="paragraph"${isDefault ? ' w:default="1"' : ""}${custom ? ' w:customStyle="1"' : ""} w:styleId="${id}"><w:name w:val="${name}"/>${isDefault ? "" : `<w:basedOn w:val="${basedOn}"/>`}<w:next w:val="${next}"/><w:uiPriority w:val="${priority}"/><w:qFormat/>${ppr ? `<w:pPr>${ppr}</w:pPr>` : ""}${rpr ? `<w:rPr>${rpr}</w:rPr>` : ""}</w:style>`;
}

export function stylesXml() {
  const styles = [
    style({ id: "Normal", name: "Normal", isDefault: true, ppr: '<w:spacing w:after="140" w:line="276" w:lineRule="auto"/>', priority: 0 }),
    style({ id: "Title", name: "Title", ppr: '<w:keepNext/><w:spacing w:before="0" w:after="200"/>', rpr: '<w:b/><w:color w:val="243D31"/><w:sz w:val="48"/><w:szCs w:val="48"/>', priority: 10 }),
    style({ id: "Heading1", name: "heading 1", ppr: '<w:keepNext/><w:spacing w:before="320" w:after="120"/><w:outlineLvl w:val="0"/>', rpr: '<w:b/><w:color w:val="244A3A"/><w:sz w:val="34"/><w:szCs w:val="34"/>', priority: 9 }),
    style({ id: "Heading2", name: "heading 2", ppr: '<w:keepNext/><w:spacing w:before="240" w:after="100"/><w:outlineLvl w:val="1"/>', rpr: '<w:b/><w:color w:val="946332"/><w:sz w:val="28"/><w:szCs w:val="28"/>', priority: 9 }),
    style({ id: "ScriptureQuote", name: "Scripture Quote", custom: true, ppr: '<w:spacing w:before="120" w:after="160"/><w:ind w:left="360" w:right="360"/>', rpr: '<w:color w:val="385245"/>', priority: 20 }),
    style({ id: "ListBullet", name: "List Bullet", ppr: '<w:numPr><w:numId w:val="1"/></w:numPr><w:spacing w:after="80"/><w:ind w:left="720" w:hanging="360"/><w:contextualSpacing/>', priority: 36 }),
    style({ id: "Takeaway", name: "Takeaway", custom: true, ppr: '<w:pBdr><w:left w:val="single" w:sz="24" w:space="8" w:color="D9B24D"/></w:pBdr><w:spacing w:before="120" w:after="160"/><w:ind w:left="240"/>', rpr: "<w:b/>", priority: 20 }),
  ].join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ${W}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${FONT}" w:hAnsi="${FONT}" w:eastAsia="${FONT}" w:cs="${FONT}"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="en-US"/></w:rPr></w:rPrDefault></w:docDefaults>${styles}</w:styles>`;
}

function numberingXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering ${W}><w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="hybridMultilevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr><w:rPr><w:rFonts w:ascii="${FONT}" w:hAnsi="${FONT}"/></w:rPr></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>`;
}

const run = (text, { b = false, i = false } = {}) => `<w:r>${b || i ? `<w:rPr>${b ? "<w:b/>" : ""}${i ? "<w:i/>" : ""}</w:rPr>` : ""}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>`;
const para = (styleId, ...runs) => `<w:p>${styleId ? `<w:pPr><w:pStyle w:val="${styleId}"/></w:pPr>` : ""}${runs.join("")}</w:p>`;
const text = (value) => run(value);

/** The sample teaching. Replace each paragraph's text with your own; keep the styles. */
export function sampleBody() {
  return [
    para("Title", text("Teaching Title Goes Here")),
    para("Heading1", text("Central Theme")),
    para(null, text("One sentence, 300 characters or fewer. Use the Normal style and exactly one paragraph.")),
    para("Heading1", text("Introduction")),
    para(null, text("One or more Normal paragraphs, 5,000 characters or fewer in total.")),
    para("Heading1", text("Short Summary")),
    para(null, text("Exactly one Normal paragraph, 800 characters or fewer.")),
    para("Heading1", text("First Teaching Category")),
    para(null, text("Normal paragraphs in a row become one section. You can use "), run("bold", { b: true }), text(", "), run("italics", { i: true }), text(", and hyperlinks to http or https addresses.")),
    para("ScriptureQuote", run("Romans 8:1 (ESV)", { b: true }), text(" — "), run("“There is therefore now no condemnation for those who are in Christ Jesus.”", { i: true })),
    para(null, text("Each Scripture Quote paragraph becomes its own section. Accepted translations: AMP, AMPC, ESV, KJV, NIV, NKJV.")),
    para("Heading2", text("A Named Subsection")),
    para(null, text("A Heading 2 gives the next section a visible title. Sections without one get a hidden title.")),
    para("Heading1", text("Second Teaching Category")),
    para("ListBullet", text("Use real Word bullets in the List Bullet style.")),
    para("ListBullet", text("Consecutive bullets become one bullets section.")),
    para("Takeaway", text("A Takeaway paragraph becomes its own takeaway section.")),
  ].join("");
}

function documentXml() {
  const sectionProperties = '<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${W}><w:body>${sampleBody()}${sectionProperties}</w:body></w:document>`;
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

export function buildTeachingTemplate() {
  const CT = "application/vnd.openxmlformats-officedocument.wordprocessingml";
  return zip([
    ["[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="${CT}.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="${CT}.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="${CT}.numbering+xml"/></Types>`],
    ["_rels/.rels", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'],
    ["word/document.xml", documentXml()],
    ["word/_rels/document.xml.rels", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/></Relationships>'],
    ["word/styles.xml", stylesXml()],
    ["word/numbering.xml", numberingXml()],
  ]);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const output = process.argv[2] ?? "The Prayer Whiteboard Teaching Template.docx";
  writeFileSync(output, buildTeachingTemplate());
  console.log(`Wrote ${output}`);
}
