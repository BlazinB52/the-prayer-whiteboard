// What publishing a weekly update does, in plain words, shown before the Administrator publishes.
//
// Publishing a weekly update emails the subscribers who chose Weekly Updates, once per update, within
// moments. An email cannot be unsent. Publishing also replaces the update that is currently showing on
// the website: the current one moves to the archive.

export type WeeklyUpdatePublishInfo = {
  /** An email for this update was already sent (it is being published again). */
  alreadySent: boolean;
  /** How many subscribers would be emailed, or null if it could not be counted. */
  recipientCount: number | null;
  /** Title of the update that is showing now and would be archived, if it is a different update. */
  replacesTitle: string | null;
};

export type WeeklyUpdatePublishNotice = {
  kind: "email" | "none";
  text: string;
  /** Wording for the confirmation dialog. */
  confirm: string;
};

export function weeklyUpdatePublishNotice(info: WeeklyUpdatePublishInfo): WeeklyUpdatePublishNotice {
  const replaces = info.replacesTitle ? ` It replaces "${info.replacesTitle}" on the website, which moves to the archive.` : "";
  if (info.alreadySent) {
    const text = `An email for this update was already sent, so publishing it again will not email anyone.${replaces}`;
    return { kind: "none", text, confirm: `Publish this weekly update?${replaces}` };
  }
  if (info.recipientCount === 0) {
    const text = `No subscribers are signed up for Weekly Updates, so no email will be sent.${replaces}`;
    return { kind: "none", text, confirm: `Publish this weekly update? No email will be sent.${replaces}` };
  }
  const who = info.recipientCount === null
    ? "every subscriber who chose Weekly Updates"
    : `${info.recipientCount} ${info.recipientCount === 1 ? "subscriber" : "subscribers"} who chose Weekly Updates`;
  const text = `Publishing emails ${who}, within moments. An email cannot be unsent, and editing the update later does not send it again.${replaces} If you are not ready for the email to go out, leave it as a draft.`;
  return { kind: "email", text, confirm: `Publish this weekly update and email ${who} now? An email cannot be unsent.${replaces}` };
}
