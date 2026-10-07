// What publishing a teaching does about email, in plain words, shown before the Administrator publishes.
//
// Publishing a teaching emails the subscribers who chose New Teachings. It happens within moments,
// once per teaching, and an email cannot be unsent. Editing a published teaching later does not send
// it again, and an Español teaching is never emailed.

export type PublishEmailInfo = {
  language: "en" | "es";
  /** An email for this teaching was already sent (for example it was unpublished and is being published again). */
  alreadySent: boolean;
  /** How many subscribers would be emailed, or null if it could not be counted. */
  recipientCount: number | null;
};

export type PublishEmailNotice = {
  /** "email" when subscribers will be emailed; "none" when nothing will be sent. */
  kind: "email" | "none";
  text: string;
};

export function publishEmailNotice(info: PublishEmailInfo): PublishEmailNotice {
  if (info.language === "es") {
    return { kind: "none", text: "No email is sent when an Español teaching is published." };
  }
  if (info.alreadySent) {
    return { kind: "none", text: "An email for this teaching was already sent, so publishing it again will not email anyone." };
  }
  if (info.recipientCount === 0) {
    return { kind: "none", text: "No subscribers are signed up for New Teachings, so no email will be sent." };
  }
  const who = info.recipientCount === null
    ? "every subscriber who chose New Teachings"
    : `${info.recipientCount} ${info.recipientCount === 1 ? "subscriber" : "subscribers"} who chose New Teachings`;
  return {
    kind: "email",
    text: `Publishing emails ${who}, within moments. An email cannot be unsent, and editing the teaching later does not send it again. If you are not ready for the email to go out, leave the teaching as a draft.`,
  };
}
