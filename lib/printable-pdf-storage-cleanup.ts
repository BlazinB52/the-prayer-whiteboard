import { PRINTABLE_PDF_BUCKET, isValidPrintablePdfStoragePath } from "./printable-pdf-links.ts";

export const PRINTABLE_PDF_CLEANUP_GRACE_PERIOD_MS = 60 * 60 * 1000;

export type PrintablePdfStorageObject = {
  name: string;
  created_at?: string | null;
  updated_at?: string | null;
  metadata?: {
    size?: number | null;
  } | null;
};

export type PrintablePdfCleanupFile = {
  path: string;
  size: number | null;
  createdAt: string | null;
  updatedAt: string | null;
  ageMs: number;
};

export function printablePdfCleanupBucket() {
  return PRINTABLE_PDF_BUCKET;
}

export function isValidPrintablePdfCleanupPath(path: string) {
  return isValidPrintablePdfStoragePath(path);
}

export function getPrintablePdfStorageObjectDate(object: PrintablePdfStorageObject) {
  const value = object.updated_at ?? object.created_at ?? null;
  if (!value) return null;

  const time = Date.parse(value);
  if (!Number.isFinite(time)) return null;

  return { value, time };
}

export function isPrintablePdfStorageObjectPastGracePeriod(object: PrintablePdfStorageObject, now = new Date()) {
  const date = getPrintablePdfStorageObjectDate(object);
  if (!date) return false;

  return now.getTime() - date.time >= PRINTABLE_PDF_CLEANUP_GRACE_PERIOD_MS;
}

export function findOrphanedPrintablePdfStorageFiles(
  objects: PrintablePdfStorageObject[],
  referencedPaths: Iterable<string>,
  now = new Date(),
) {
  const referenced = new Set(referencedPaths);

  return objects
    .filter((object) => isValidPrintablePdfCleanupPath(object.name))
    .filter((object) => !referenced.has(object.name))
    .filter((object) => isPrintablePdfStorageObjectPastGracePeriod(object, now))
    .map((object): PrintablePdfCleanupFile => {
      const date = getPrintablePdfStorageObjectDate(object);
      return {
        path: object.name,
        size: typeof object.metadata?.size === "number" ? object.metadata.size : null,
        createdAt: object.created_at ?? null,
        updatedAt: object.updated_at ?? null,
        ageMs: date ? Math.max(0, now.getTime() - date.time) : 0,
      };
    })
    .sort((a, b) => b.ageMs - a.ageMs || a.path.localeCompare(b.path));
}

export function normalizePrintablePdfCleanupSelection(paths: unknown) {
  const rawPaths = Array.isArray(paths) ? paths : [];
  const uniquePaths = Array.from(new Set(rawPaths.filter((path): path is string => typeof path === "string").map((path) => path.trim())));

  return {
    validPaths: uniquePaths.filter(isValidPrintablePdfCleanupPath),
    rejectedPaths: uniquePaths.filter((path) => !isValidPrintablePdfCleanupPath(path)),
  };
}
