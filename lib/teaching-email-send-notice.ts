// What the "Email subscribers" box on a teaching's edit page says and allows, in plain words.
//
// The email to subscribers is sent only when an Administrator presses the button, never because a
// teaching was published or featured. It can only be sent once the teaching is published (the email
// links to the live page), and only once: a finished send cannot be repeated, and one that was cut
// short can be resumed so it reaches only the subscribers who do not have it yet.

export type TeachingEmailSendInput = {
  status: string;
  language: "en" | "es";
  /** The state of the send ledger row for this teaching, or null if no send was ever started. */
  ledgerStatus: "sending" | "sent" | "failed" | null;
  /** Subscribers who already have the email. */
  deliveredCount: number;
  /** How many subscribers the started send was meant for, if known. */
  ledgerRecipientCount: number | null;
  /** How many subscribers a new send would reach, or null if it could not be counted. */
  recipientCount: number | null;
};

export type TeachingEmailSendNotice = {
  kind: "unpublished" | "none" | "ready" | "resume" | "sent";
  text: string;
  canSend: boolean;
  buttonLabel: string;
  confirm: string;
};

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

export function teachingEmailSendNotice(input: TeachingEmailSendInput): TeachingEmailSendNotice {
  const quiet = { canSend: false, buttonLabel: "", confirm: "" };
  // An Español teaching is emailed in Spanish, and only to subscribers who chose Español.
  const audience = input.language === "es" ? "New Teachings in Español" : "New Teachings";

  if (input.status !== "published") {
    return {
      kind: "unpublished",
      text: "Publish this teaching first. The email links to the published page, so it can only be sent once the teaching is live.",
      ...quiet,
    };
  }
  if (input.ledgerStatus === "sent") {
    const total = input.deliveredCount || input.ledgerRecipientCount || 0;
    return { kind: "sent", text: `The email was sent to ${plural(total, "subscriber", "subscribers")}. It cannot be sent again.`, ...quiet };
  }
  if (input.ledgerStatus === "sending" || input.ledgerStatus === "failed") {
    const total = input.ledgerRecipientCount;
    return {
      kind: "resume",
      text: `The email was started but did not finish: ${input.deliveredCount}${total ? ` of ${total}` : ""} ${total === 1 ? "subscriber has" : "subscribers have"} it. Resume to send it to the rest. Nobody who already has it is emailed again.`,
      canSend: true,
      buttonLabel: "Resume sending",
      confirm: "Send the email to the subscribers who have not received it yet? Nobody who already has it is emailed again, and an email cannot be unsent.",
    };
  }
  if (input.recipientCount === 0) {
    return { kind: "none", text: `No subscribers are signed up for ${audience}, so there is nobody to email.`, ...quiet };
  }
  const who = input.recipientCount === null
    ? `every subscriber who chose ${audience}`
    : `${plural(input.recipientCount, "subscriber", "subscribers")} who chose ${audience}`;
  return {
    kind: "ready",
    text: `Not sent yet. Sending emails ${who}, within moments. It goes out once, an email cannot be unsent, and editing the teaching later does not send it again.`,
    canSend: true,
    buttonLabel: input.recipientCount === null ? "Send email to subscribers" : `Send email to ${plural(input.recipientCount, "subscriber", "subscribers")}`,
    confirm: `Send this teaching's email to ${who} now? It goes out within moments and cannot be unsent.`,
  };
}
