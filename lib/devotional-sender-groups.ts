export const SENDER_MASTER_DEVOTIONAL_GROUP_ID = "bo98N3";

const DEVOTIONAL_SENDER_GROUP_IDS: Readonly<Record<string, string>> = {
  "aliyah-israel-the-harvest-and-prayer": "bmVQgn",
  "beyond-the-garden": "e30QBQ",
  "5787-the-year-of-the-spoken-word-and-divine-rest": "bWzpxx",
};

export function getDevotionalSenderGroupIds(slug?: string | null) {
  const seriesGroupId = slug ? DEVOTIONAL_SENDER_GROUP_IDS[slug] : null;
  return seriesGroupId
    ? [SENDER_MASTER_DEVOTIONAL_GROUP_ID, seriesGroupId]
    : [SENDER_MASTER_DEVOTIONAL_GROUP_ID];
}
