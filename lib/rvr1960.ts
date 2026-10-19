// Looks up the published Reina-Valera 1960 text of a passage on BibleGateway, so a Spanish Scripture quotation is
// the printed RVR1960 wording and never a translator's memory of it. Takes the English reference ("Ephesians 1:3-4")
// because that is how the English devotional stores it. Returns null when the page cannot be read or has no verse
// text, and the caller decides what to do (the devotional translator then flags the passage for a person to check).

export async function fetchRvr1960(reference: string, fetchImpl: typeof fetch = fetch): Promise<string | null> {
  const search = reference.replace(/(\d)[a-z](?=\s*[–-])/, "$1").replace(/(\d)[a-z]$/, "$1").trim();
  if (!search) return null;
  try {
    const response = await fetchImpl(`https://www.biblegateway.com/passage/?search=${encodeURIComponent(search)}&version=RVR1960`, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!response.ok) return null;
    return extractRvr1960(await response.text());
  } catch {
    return null;
  }
}

/** The verse text inside a BibleGateway passage page, with verse numbers, headings, footnotes and page furniture removed. */
export function extractRvr1960(html: string): string | null {
  const body = (html.match(/<div class="passage-text">([\s\S]*?)<div class="(?:footnotes|publisher-info-bottom)/) ?? [])[1] ?? "";
  const text = body
    .replace(/<sup[\s\S]*?<\/sup>/g, " ")
    .replace(/<span class="(?:chapternum|versenum)[\s\S]*?<\/span>/g, " ")
    .replace(/<h3[\s\S]*?<\/h3>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#8217;|&rsquo;/g, "'")
    .replace(/&#8220;|&#8221;|&ldquo;|&rdquo;/g, '"')
    .replace(/&#\d+;/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s+(?:Read full chapter|Cross references|Next )[\s\S]*$/, "")
    .replace(/\(\s*[^)]*\d+\.\d+[^)]*\)\s*/g, "")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim()
    // A passage that stops mid-sentence ends in "..." instead of a dangling comma.
    .replace(/[,;:]$/, "...");
  return text || null;
}
