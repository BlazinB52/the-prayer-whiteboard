// Anchor scriptures read "Reference (VER) — "quote"": the reference leads and the
// quotation follows an em dash, all in one list entry. Two older shapes are
// converted: a quote line followed by a separate "- Reference" line (which
// otherwise renders as two bullets), and "Reference (VER): "quote"" with a colon
// or hyphen. Wording is never changed, only the arrangement and the spaces just
// inside the quotation marks.
const OPENS_WITH_QUOTE = /^["“]/;
const DASHED_REFERENCE = /^[-–—]\s*(\S.*)$/;
const REFERENCE_THEN_QUOTE = /^(.*?\([^()]+\))\s*[:\-–—]\s*(["“].*)$/;

function tidyQuote(quote: string) {
  return quote.trim().replace(/^(["“])\s+/, "$1").replace(/\s+(["”])$/, "$1");
}

export function formatAnchorScriptures(lines: string[]) {
  const formatted: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line) continue;

    const reference = lines[index + 1]?.trim().match(DASHED_REFERENCE)?.[1];
    if (OPENS_WITH_QUOTE.test(line) && reference) {
      formatted.push(`${reference.trim()} — ${tidyQuote(line)}`);
      index += 1;
      continue;
    }

    const combined = line.match(REFERENCE_THEN_QUOTE);
    formatted.push(combined ? `${combined[1].trim()} — ${tidyQuote(combined[2])}` : line);
  }
  return formatted;
}

// ---------------------------------------------------------------------------
// Display grouping
//
// Verses are shown one way everywhere: the reference in bold, with the verse directly under it in
// italics. Stored text arrives in several shapes, so this reads them all without changing a word:
//   "Reference (VER) — "quote""        one entry
//   "Reference (VER)\n"quote""         one entry with a line break
//   "Reference (VER)" then "quote"     two entries in a row
//   ""quote"" then "- Reference (VER)" the older shape
// A lone reference comes back with an empty verse; anything else it cannot read is returned as a verse with no reference.
// ---------------------------------------------------------------------------

export type ScriptureEntry = { reference: string | null; quote: string };

const REFERENCE_LINE = /^(?:[1-3]\s?)?\p{L}[\p{L}.]*(?:\s+\p{L}[\p{L}.]*){0,3}\s+\d+(?::\d+(?:\s*[-–,]\s*\d+(?::\d+)?)*)?(?:\s*\([^()]+\))?$/u;
const REFERENCE_THEN_DASH_QUOTE = /^(.+?\))\s*[:\-–—]\s*(.+)$/;
const REFERENCE_NO_TRANSLATION_THEN_QUOTE = /^(.+?\d)\s*[:\-–—]\s*(["“].+)$/;

function plain(text: string) {
  return text.replace(/\*\*/g, "").replace(/^\*|\*$/g, "").trim().replace(/[:：]$/, "").trim();
}

export function looksLikeScriptureReference(text: string) {
  const value = plain(text);
  return value.length <= 80 && !OPENS_WITH_QUOTE.test(value) && REFERENCE_LINE.test(value);
}

export function groupScriptureEntries(entries: string[]): ScriptureEntry[] {
  const lines = entries.map((entry) => String(entry ?? "").trim()).filter(Boolean);
  const grouped: ScriptureEntry[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const next = lines[index + 1];

    const [firstLine, ...restLines] = line.split(/\r?\n/);
    if (restLines.length && looksLikeScriptureReference(firstLine) && restLines.join("\n").trim()) {
      grouped.push({ reference: plain(firstLine), quote: restLines.join("\n").trim() });
      continue;
    }

    const dashed = next?.match(DASHED_REFERENCE)?.[1];
    if (OPENS_WITH_QUOTE.test(line) && dashed && looksLikeScriptureReference(dashed)) {
      grouped.push({ reference: plain(dashed), quote: line });
      index += 1;
      continue;
    }

    const inline = line.match(REFERENCE_THEN_DASH_QUOTE) ?? line.match(REFERENCE_NO_TRANSLATION_THEN_QUOTE);
    if (inline && looksLikeScriptureReference(inline[1])) {
      grouped.push({ reference: plain(inline[1]), quote: inline[2].trim() });
      continue;
    }

    if (next && looksLikeScriptureReference(line) && !looksLikeScriptureReference(next)) {
      grouped.push({ reference: plain(line), quote: next });
      index += 1;
      continue;
    }

    // A reference with no verse after it stays a bold reference, not an italic verse.
    grouped.push(looksLikeScriptureReference(line) ? { reference: plain(line), quote: "" } : { reference: null, quote: line });
  }

  return grouped;
}

/** Italics already mark a quotation, so one pair of straight or curly quotes around the whole verse is dropped when shown. */
export function stripWrappingQuotes(quote: string) {
  const value = quote.trim();
  if (value.length < 2 || !/^["“][\s\S]*["”]$/.test(value)) return value;
  const inner = value.slice(1, -1);
  // More quote marks inside means several separate quotations, so none of them are removed.
  return /["“”]/.test(inner) ? value : inner.trim();
}
