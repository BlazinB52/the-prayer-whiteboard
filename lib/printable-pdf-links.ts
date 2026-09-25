export const PRINTABLE_PDF_URL_MAX_LENGTH = 2048;

const FORBIDDEN_PROTOCOLS = new Set(["javascript:", "data:", "file:"]);

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
