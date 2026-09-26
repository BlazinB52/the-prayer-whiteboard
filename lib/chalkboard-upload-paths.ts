import { isValidUuid } from "./uuid.ts";

const STORAGE_SLUG_PATTERN = /^\d{8}_[a-z0-9](?:[a-z0-9-]{0,79})$/;
const INCOMING_PATH_PATTERN = /^library\/([^/]+)\/([0-9a-f-]{36})\/v1\/incoming\.(jpg|jpeg|png|webp)$/i;

export function validChalkboardAssetGroupId(value: string) {
  return isValidUuid(value);
}

export function extensionForChalkboardFile(fileName: string) {
  const extension = fileName.toLowerCase().split(".").pop();
  return extension === "jpg" || extension === "jpeg" || extension === "png" || extension === "webp" ? extension : null;
}

export function chalkboardStoragePaths(storageSlug: string, assetGroupId: string) {
  const base = `library/${storageSlug}/${assetGroupId}/v1`;
  return {
    incoming: `${base}/incoming`,
    website: `${base}/website.webp`,
    download: `${base}/download.png`,
  };
}

export function parseIncomingChalkboardPath(path: string) {
  const match = INCOMING_PATH_PATTERN.exec(path);
  if (!match || !STORAGE_SLUG_PATTERN.test(match[1]) || !validChalkboardAssetGroupId(match[2])) return null;
  return {
    storageSlug: match[1],
    assetGroupId: match[2],
    extension: match[3].toLowerCase(),
  };
}
