// How publication files are named, in one place so every module reads and writes the same way.
//
// The date comes first, then the language, then what the file is: 20261010_es_handout.docx, 20261010_en_teaching.docx.
// Sorted by name, a gathering's English and Español files sit next to each other. The older language-first style
// (es_20261010_handout.docx) is still read, so files already made keep working.

export type FileNameStamp = {
  /** The date in the name as YYYY-MM-DD, or null when there is none or it is not a real date. */
  date: string | null;
  /** The two-letter language code in the name, lower case, or null when there is none. */
  language: string | null;
};

function realDate(year: string, month: string, day: string) {
  const value = `${year}-${month}-${day}`;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : null;
}

/**
 * Reads the date and language from the start of a file name. Accepts 20261010_es_handout.docx, and the older
 * es_20261010_handout.docx and a bare 20261010_handout.docx. A language is only a language when it stands alone
 * between separators, so 20261010_teaching is a date with no language.
 */
export function parseFileNameStamp(fileName: string): FileNameStamp {
  const name = fileName.split(/[\\/]/).pop() ?? fileName;
  const dateFirst = name.match(/^(\d{4})(\d{2})(\d{2})(?!\d)(?:[_\- ]([a-z]{2})(?=[_\- .]|$))?/i);
  if (dateFirst) {
    return { date: realDate(dateFirst[1], dateFirst[2], dateFirst[3]), language: dateFirst[4]?.toLowerCase() ?? null };
  }
  const languageFirst = name.match(/^([a-z]{2})[_\- ](\d{4})(\d{2})(\d{2})(?!\d)/i);
  if (languageFirst) {
    return { date: realDate(languageFirst[2], languageFirst[3], languageFirst[4]), language: languageFirst[1].toLowerCase() };
  }
  return { date: null, language: null };
}

/** 20261010 for 2026-10-10 (or a longer timestamp); today's date when the value is empty or not a date. */
export function fileNameDate(date: string | null | undefined, today: Date = new Date()) {
  const source = date && /^\d{4}-\d{2}-\d{2}/.test(date) ? date.slice(0, 10) : today.toISOString().slice(0, 10);
  return source.replaceAll("-", "");
}

/** 20261010_es_handout.docx */
export function publicationFileName(date: string | null | undefined, language: "en" | "es", kind: string, extension: string, today: Date = new Date()) {
  return `${fileNameDate(date, today)}_${language}_${kind}.${extension}`;
}

/** "Honduras" becomes honduras, "U.S. Edition" becomes u-s-edition: the version part of a file name. */
export function versionSlug(label: string) {
  return label
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
