// Builds the "Title Collections" report: for every teaching, everything that goes with it, in English and
// Español, so it is clear what is done and what is not. Pure data shaping, no database access.

export type CollectionLanguage = "en" | "es";
export type CollectionPiece = "whiteboard" | "weeklyUpdate" | "handout" | "devotional" | "outline";
export type EntryState = "published" | "draft" | "exists";

export const COLLECTION_PIECES: { key: CollectionPiece; label: string }[] = [
  { key: "whiteboard", label: "Whiteboard" },
  { key: "weeklyUpdate", label: "Weekly Update" },
  { key: "handout", label: "Handout" },
  { key: "devotional", label: "Devotional" },
  { key: "outline", label: "Outline" },
];

export type CollectionEntry = { id: string; title: string; state: EntryState; href: string };

export type TeachingInput = {
  id: string;
  title: string;
  language: CollectionLanguage;
  status: string;
  gathering_date: string | null;
  translation_of: string | null;
};

/** Anything that can belong to a teaching. `parentId` is a translation's original, used when it has no teaching of its own. */
export type PieceInput = {
  id: string;
  title: string;
  language: CollectionLanguage;
  teachingIds: string[];
  state: EntryState;
  href: string;
  parentId?: string | null;
};

export type CollectionRow = {
  teaching: TeachingInput;
  /** The teaching in each language: the English original and its Español translation. */
  teachings: Record<CollectionLanguage, CollectionEntry[]>;
  pieces: Record<CollectionPiece, Record<CollectionLanguage, CollectionEntry[]>>;
  filled: number;
  total: number;
  hasDraft: boolean;
  complete: boolean;
  missingSpanish: boolean;
};

export type UnlinkedItem = CollectionEntry & { language: CollectionLanguage; note?: string };

export type CollectionReport = {
  rows: CollectionRow[];
  hiddenArchived: number;
  unlinked: Record<"teaching" | CollectionPiece, UnlinkedItem[]>;
};

const LANGUAGES: CollectionLanguage[] = ["en", "es"];
// One slot per language for the teaching itself and for each of the five other pieces.
export const SLOTS_PER_TEACHING = (COLLECTION_PIECES.length + 1) * LANGUAGES.length;

function emptyByLanguage(): Record<CollectionLanguage, CollectionEntry[]> {
  return { en: [], es: [] };
}

function teachingState(status: string): EntryState {
  return status === "draft" ? "draft" : "published";
}

export function buildCollectionReport(input: {
  teachings: TeachingInput[];
  pieces: Record<CollectionPiece, PieceInput[]>;
}): CollectionReport {
  const byId = new Map(input.teachings.map((teaching) => [teaching.id, teaching]));
  // An Español teaching is grouped under its English original. Without one it stands on its own row.
  const rootOf = (teaching: TeachingInput) => {
    const original = teaching.translation_of ? byId.get(teaching.translation_of) : undefined;
    return original ?? teaching;
  };

  const rows = new Map<string, CollectionRow>();
  const rowFor = (root: TeachingInput) => {
    let row = rows.get(root.id);
    if (!row) {
      row = {
        teaching: root,
        teachings: emptyByLanguage(),
        pieces: {
          whiteboard: emptyByLanguage(),
          weeklyUpdate: emptyByLanguage(),
          handout: emptyByLanguage(),
          devotional: emptyByLanguage(),
          outline: emptyByLanguage(),
        },
        filled: 0,
        total: SLOTS_PER_TEACHING,
        hasDraft: false,
        complete: false,
        missingSpanish: false,
      };
      rows.set(root.id, row);
    }
    return row;
  };

  for (const teaching of input.teachings) {
    rowFor(rootOf(teaching)).teachings[teaching.language].push({
      id: teaching.id,
      title: teaching.title,
      state: teachingState(teaching.status),
      href: `/admin/teachings/${teaching.id}/edit`,
    });
  }

  const unlinked: CollectionReport["unlinked"] = { teaching: [], whiteboard: [], weeklyUpdate: [], handout: [], devotional: [], outline: [] };

  for (const piece of COLLECTION_PIECES) {
    const items = input.pieces[piece.key];
    const itemsById = new Map(items.map((item) => [item.id, item]));
    // The teaching an item belongs to: its own link, or if it has none, the link of the item it translates.
    const resolve = (item: PieceInput, seen = new Set<string>()): TeachingInput | null => {
      for (const teachingId of item.teachingIds) {
        const teaching = byId.get(teachingId);
        if (teaching) return rootOf(teaching);
      }
      const parent = item.parentId ? itemsById.get(item.parentId) : undefined;
      if (parent && !seen.has(parent.id)) return resolve(parent, new Set(seen).add(item.id));
      return null;
    };
    for (const item of items) {
      const entry: CollectionEntry = { id: item.id, title: item.title, state: item.state, href: item.href };
      const root = resolve(item);
      if (!root) unlinked[piece.key].push({ ...entry, language: item.language });
      else rowFor(root).pieces[piece.key][item.language].push(entry);
    }
  }

  let hiddenArchived = 0;
  const finished: CollectionRow[] = [];
  for (const row of rows.values()) {
    // The row is headed by the English teaching. The grouping can land on the Español one (for example when the two are
    // linked the other way round), and the row must not then read in Español.
    const english = row.teachings.en.length ? byId.get(row.teachings.en[0].id) : undefined;
    if (english) row.teaching = english;
    if (row.teaching.status === "archived") {
      hiddenArchived += 1;
      continue;
    }
    let filled = 0;
    let hasDraft = false;
    const slots = [row.teachings, ...COLLECTION_PIECES.map((piece) => row.pieces[piece.key])];
    for (const slot of slots) {
      for (const language of LANGUAGES) {
        if (slot[language].length) filled += 1;
        if (slot[language].length && slot[language].every((entry) => entry.state === "draft")) hasDraft = true;
      }
    }
    row.filled = filled;
    row.hasDraft = hasDraft;
    row.complete = filled === row.total && !hasDraft;
    row.missingSpanish = slots.some((slot) => slot.es.length === 0);
    finished.push(row);
  }

  finished.sort((a, b) => {
    const left = a.teaching.gathering_date ?? "";
    const right = b.teaching.gathering_date ?? "";
    return right.localeCompare(left) || a.teaching.title.localeCompare(b.teaching.title);
  });

  return { rows: finished, hiddenArchived, unlinked };
}

export function rowMissingPiece(row: CollectionRow, piece: CollectionPiece) {
  return row.pieces[piece].en.length === 0 || row.pieces[piece].es.length === 0;
}
