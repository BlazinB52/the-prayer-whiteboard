function parseGroupMap(raw: string | undefined): Readonly<Record<string, string>> {
  if (!raw) return {};
  return Object.fromEntries(
    raw
      .split(",")
      .map((entry) => entry.split(":").map((part) => part.trim()))
      .filter((parts): parts is [string, string] => parts.length === 2 && Boolean(parts[0]) && Boolean(parts[1])),
  );
}

const CATEGORY_GROUP_ENV_VARS: Readonly<Record<string, string>> = {
  weekly_updates: "SENDER_WEEKLY_UPDATES_GROUP_ID",
  teachings: "SENDER_TEACHINGS_GROUP_ID",
};

export function getDevotionalSenderGroupIds(slug?: string | null) {
  const masterGroupId = (process.env.SENDER_DEVOTIONAL_MASTER_GROUP_ID ?? "").trim();
  const seriesGroupId = slug ? parseGroupMap(process.env.SENDER_DEVOTIONAL_SERIES_GROUP_IDS)[slug] : null;
  return [masterGroupId, seriesGroupId].filter((id): id is string => Boolean(id));
}

// Devotionals resolve to the master group plus an optional per-series group;
// the other categories map to a single group each.
export function getSenderGroupIdsForCategories(categories: readonly string[], slug?: string | null) {
  const groupIds = new Set<string>();
  for (const category of categories) {
    if (category === "devotionals") {
      for (const groupId of getDevotionalSenderGroupIds(slug)) groupIds.add(groupId);
      continue;
    }
    const envVar = CATEGORY_GROUP_ENV_VARS[category];
    const groupId = envVar ? (process.env[envVar] ?? "").trim() : "";
    if (groupId) groupIds.add(groupId);
  }
  return [...groupIds];
}
