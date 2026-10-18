// Which backup folders exist and which are old enough to remove. Pure functions, so the rules are tested without touching a disk.

// Folders made by backup-supabase.mjs: yyyymmdd_supabase, or yyyymmdd_supabase_2, _3 when run again the same day.
const BACKUP_FOLDER = /^(\d{8})_supabase(?:_(\d+))?$/;

export function isBackupFolderName(name) {
  return BACKUP_FOLDER.test(name);
}

// Oldest first: by date, then by the same-day counter (no suffix is the first of the day).
export function sortBackupFolders(names) {
  const key = (name) => {
    const match = BACKUP_FOLDER.exec(name);
    return `${match[1]}_${String(match[2] ?? 1).padStart(4, "0")}`;
  };
  return names.filter(isBackupFolderName).sort((a, b) => key(a).localeCompare(key(b)));
}

// Everything except the newest `keep` backups.
export function foldersToPrune(names, keep) {
  const sorted = sortBackupFolders(names);
  return sorted.slice(0, Math.max(0, sorted.length - keep));
}

// The newest `keep` backups.
export function newestFolders(names, keep) {
  return sortBackupFolders(names).slice(-keep);
}

// The name for a copy of `name` in a folder that already holds `existing`. Two roots can both have a backup made the same
// day under the same name, so a copy that is not the same backup takes the next free same-day suffix instead.
export function freeFolderName(name, existing) {
  const taken = new Set(existing);
  if (!taken.has(name)) return name;
  const base = name.replace(/_\d+$/, "");
  for (let suffix = 2; ; suffix += 1) {
    if (!taken.has(`${base}_${suffix}`)) return `${base}_${suffix}`;
  }
}
