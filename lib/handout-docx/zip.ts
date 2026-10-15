// A small zip reader and writer for Word files, with binary parts (pictures) kept byte for byte. A .docx is a zip of
// parts; the handout builder reads the template's parts, changes a few, and writes them back.
import { deflateRawSync, inflateRawSync } from "node:zlib";

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

export const MAX_ZIP_ENTRIES = 500;
export const MAX_UNCOMPRESSED_BYTES = 64 * 1024 * 1024;

/** Every part of a zip, in order, by name. Throws on anything that is not a plain zip (no encryption, no zip64). */
export function readZip(buffer: Buffer): Map<string, Buffer> {
  let end = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i -= 1) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new Error("This is not a zip file.");
  const count = buffer.readUInt16LE(end + 10);
  let offset = buffer.readUInt32LE(end + 16);
  if (count > MAX_ZIP_ENTRIES) throw new Error("The zip has too many parts.");

  const parts = new Map<string, Buffer>();
  let total = 0;
  for (let i = 0; i < count; i += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error("The zip is damaged.");
    const method = buffer.readUInt16LE(offset + 10);
    const compressed = buffer.readUInt32LE(offset + 20);
    const size = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const local = buffer.readUInt32LE(offset + 42);
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString("utf8");
    offset += 46 + nameLength + extraLength + commentLength;

    total += size;
    if (total > MAX_UNCOMPRESSED_BYTES) throw new Error("The zip is too large.");
    if (name.endsWith("/")) continue;
    const dataStart = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
    const raw = buffer.subarray(dataStart, dataStart + compressed);
    if (method === 0) parts.set(name, Buffer.from(raw));
    else if (method === 8) parts.set(name, inflateRawSync(raw));
    else throw new Error("The zip uses a method this reader does not support.");
  }
  return parts;
}

/** Writes parts as a zip. [Content_Types].xml goes first, as Word expects. */
export function writeZip(parts: Map<string, Buffer>): Buffer {
  const names = [...parts.keys()].sort((a, b) => (a === "[Content_Types].xml" ? -1 : b === "[Content_Types].xml" ? 1 : 0));
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const name of names) {
    const data = parts.get(name)!;
    const nameBuffer = Buffer.from(name, "utf8");
    const packed = deflateRawSync(data);
    const method = packed.length < data.length ? 8 : 0;
    const body = method === 8 ? packed : data;
    const crc = crc32(data);

    const local = Buffer.alloc(30 + nameBuffer.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // names are UTF-8
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuffer.length, 26);
    nameBuffer.copy(local, 30);

    const central = Buffer.alloc(46 + nameBuffer.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuffer.length, 28);
    central.writeUInt32LE(offset, 42);
    nameBuffer.copy(central, 46);

    locals.push(local, body);
    centrals.push(central);
    offset += local.length + body.length;
  }
  const centralSize = centrals.reduce((sum, item) => sum + item.length, 0);
  const endRecord = Buffer.alloc(22);
  endRecord.writeUInt32LE(0x06054b50, 0);
  endRecord.writeUInt16LE(names.length, 8);
  endRecord.writeUInt16LE(names.length, 10);
  endRecord.writeUInt32LE(centralSize, 12);
  endRecord.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, endRecord]);
}
