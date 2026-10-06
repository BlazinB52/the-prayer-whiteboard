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

// Español groups. A subscriber who chooses Español joins the matching group for every category they
// selected, whatever other languages they also chose.
const ES_CATEGORY_GROUP_ENV_VARS: Readonly<Record<string, string>> = {
  weekly_updates: "SENDER_ES_WEEKLY_UPDATES_GROUP_ID",
  teachings: "SENDER_ES_TEACHINGS_GROUP_ID",
  devotionals: "SENDER_ES_DEVOTIONALS_GROUP_ID",
};

function configuredId(envVar: string | undefined) {
  return envVar ? (process.env[envVar] ?? "").trim() : "";
}

/** The groups a subscriber belongs in: English groups for English, Español groups for Español, both for both. */
export function getSenderGroupIdsForSubscription(languages: readonly string[], categories: readonly string[], slug?: string | null) {
  const groupIds = new Set<string>();
  if (languages.includes("en")) {
    for (const groupId of getSenderGroupIdsForCategories(categories, slug)) groupIds.add(groupId);
  }
  if (languages.includes("es")) {
    for (const category of categories) {
      const groupId = configuredId(ES_CATEGORY_GROUP_ENV_VARS[category]);
      if (groupId) groupIds.add(groupId);
    }
  }
  return [...groupIds];
}

/**
 * Every group the app manages. `fixed` are the per-category and master groups; `series` are the
 * per-devotional-series groups, which are only joined through a series signup and so are only
 * removed when the subscriber no longer wants English devotionals at all.
 */
export function getManagedSenderGroupIds() {
  const fixed = [
    ...Object.values(CATEGORY_GROUP_ENV_VARS).map(configuredId),
    configuredId("SENDER_DEVOTIONAL_MASTER_GROUP_ID"),
    ...Object.values(ES_CATEGORY_GROUP_ENV_VARS).map(configuredId),
  ].filter(Boolean);
  const series = Object.values(parseGroupMap(process.env.SENDER_DEVOTIONAL_SERIES_GROUP_IDS)).filter(Boolean);
  return { fixed: [...new Set(fixed)], series: [...new Set(series)] };
}
