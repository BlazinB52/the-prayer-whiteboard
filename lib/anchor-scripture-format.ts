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
