export const PRINTABLE_PDF_URL_MAX_LENGTH = 2048;
export const PRINTABLE_PDF_TITLE_MAX_LENGTH = 200;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const FORBIDDEN_PROTOCOLS = new Set(["javascript:", "data:", "file:"]);

export function validatePrintablePdfId(value: unknown) {
  const id = typeof value === "string" ? value.trim() : "";

  if (!id) {
    return { error: "Printable PDF record was not submitted." };
  }

  if (!UUID_PATTERN.test(id)) {
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

export function validatePrintablePdfUrl(value: string) {
  const url = value.trim();

  if (!url) {
    return { error: "Printable PDF URL is required." };
  }

  if (url.length > PRINTABLE_PDF_URL_MAX_LENGTH) {
    return { error: "Printable PDF URL must be 2,048 characters or fewer." };
  }

  if (/[<>"\s]/.test(url)) {
    return { error: "Printable PDF URL must be a plain URL without spaces or HTML." };
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { error: "Printable PDF URL must be a valid URL." };
  }

  if (FORBIDDEN_PROTOCOLS.has(parsed.protocol) || parsed.protocol !== "https:") {
    return { error: "Printable PDF URL must start with https://." };
  }

  if (!parsed.hostname.includes(".")) {
    return { error: "Printable PDF URL must include a valid host." };
  }

  return { value: parsed.toString() };
}
