// Which backup folders exist and which are old enough to remove. Pure functions, so the rules are tested without touching a disk.
//
// There are three kinds of backup folder, each with its own name pattern and its own newest-N rule: the Supabase backup
// (backup-supabase.mjs), the project files (whiteboard_<date>_<time>_<commit>) and the Prayer Group files
// (Prayer_Group_Backup_<date>_<time>), the last two made by PrayerWhiteboard_Backup_Timestamped.bat.

// Folders made by backup-supabase.mjs: yyyymmdd_supabase, or yyyymmdd_supabase_2, _3 when run again the same day.
const SUPABASE_FOLDER = /^(\d{8})_supabase(?:_(\d+))?$/;

export function isBackupFolderName(name) {
  return SUPABASE_FOLDER.test(name);
}

// Oldest first: by date, then by the same-day counter (no suffix is the first of the day).
export function sortBackupFolders(names) {
  const key = (name) => {
    const match = SUPABASE_FOLDER.exec(name);
    return `${match[1]}_${String(match[2] ?? 1).padStart(4, "0")}`;
  };
  return names.filter(isBackupFolderName).sort((a, b) => key(a).localeCompare(key(b)));
}

export const SUPABASE_BACKUPS = { matches: isBackupFolderName, sort: sortBackupFolders };

// The two kinds of file backup are named with a timestamp that sorts correctly as plain text (2026-10-18_14-05-00).
// A ".partial" folder is a copy still being made, so it never counts.
export function timestampedBackups(prefix) {
  const matches = (name) => name.startsWith(prefix) && /\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}/.test(name) && !name.endsWith(".partial");
  return { matches, sort: (names) => names.filter(matches).sort() };
}

// Everything except the newest `keep` backups of this kind.
export function foldersToPrune(names, keep, kind = SUPABASE_BACKUPS) {
  const sorted = kind.sort(names);
  return sorted.slice(0, Math.max(0, sorted.length - keep));
}

// The newest `keep` backups of this kind.
export function newestFolders(names, keep, kind = SUPABASE_BACKUPS) {
  return kind.sort(names).slice(-keep);
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
