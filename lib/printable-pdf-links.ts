import { isValidUuid } from "./uuid.ts";

export const PRINTABLE_PDF_TITLE_MAX_LENGTH = 200;
export const PRINTABLE_PDF_BUCKET = "printable-pdfs";
export const PRINTABLE_PDF_MAX_BYTES = 26_214_400; // 25 MiB, matches the bucket's file_size_limit
const PDF_MAGIC_BYTES = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"

const STORAGE_PATH_PATTERN = /^([0-9a-f-]{36})\.pdf$/i;

export function validatePrintablePdfId(value: unknown) {
  const id = typeof value === "string" ? value.trim() : "";

  if (!id) {
    return { error: "Printable PDF record was not submitted." };
  }

  if (!isValidUuid(id)) {
    return { error: "Printable PDF record ID is invalid." };
  }

  return { value: id };
}

export function validatePrintablePdfTitle(value: unknown) {
  const title = typeof value === "string" ? value.trim() : "";

  if (!title) {
    return { error: "Title is required." };
  }

  if (title.length > PRINTABLE_PDF_TITLE_MAX_LENGTH) {
    return { error: `Title must be ${PRINTABLE_PDF_TITLE_MAX_LENGTH} characters or fewer.` };
  }

  return { value: title };
}

export function printablePdfStoragePath(uploadId: string) {
  return `${uploadId}.pdf`;
}

export function isValidPrintablePdfStoragePath(path: string) {
  const match = STORAGE_PATH_PATTERN.exec(path);
  return Boolean(match && isValidUuid(match[1]));
}

export function isValidPdfMagicBytes(bytes: Uint8Array) {
  if (bytes.length < PDF_MAGIC_BYTES.length) return false;
  return PDF_MAGIC_BYTES.every((byte, index) => bytes[index] === byte);
}

type PublicUrlClient = {
  storage: {
    from(bucket: string): {
      getPublicUrl(path: string): { data: { publicUrl: string } };
    };
  };
};

export function resolvePrintablePdfHref(storagePath: string, supabase: PublicUrlClient) {
  return supabase.storage.from(PRINTABLE_PDF_BUCKET).getPublicUrl(storagePath).data.publicUrl;
}
