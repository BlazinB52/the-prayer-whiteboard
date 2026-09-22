function parseGroupMap(raw: string | undefined): Readonly<Record<string, string>> {
  if (!raw) return {};
  return Object.fromEntries(
    raw
      .split(",")
      .map((entry) => entry.split(":").map((part) => part.trim()))
      .filter((parts): parts is [string, string] => parts.length === 2 && Boolean(parts[0]) && Boolean(parts[1])),
  );
}

export function getDevotionalSenderGroupIds(slug?: string | null) {
  const masterGroupId = (process.env.SENDER_DEVOTIONAL_MASTER_GROUP_ID ?? "").trim();
  const seriesGroupId = slug ? parseGroupMap(process.env.SENDER_DEVOTIONAL_SERIES_GROUP_IDS)[slug] : null;
  return [masterGroupId, seriesGroupId].filter((id): id is string => Boolean(id));
}
