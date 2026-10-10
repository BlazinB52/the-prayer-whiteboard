// What publishing a teaching does about email, in plain words, shown before the Administrator publishes.
//
// Publishing never emails anyone. Sending the teaching to subscribers is a separate step the
// Administrator takes on purpose, from the "Email subscribers" box on the teaching's edit page, once the
// teaching is published and its link works. See lib/teaching-email-send-notice.ts.

export type PublishEmailNotice = {
  kind: "none";
  text: string;
};

export function publishEmailNotice(info: { language: "en" | "es" }): PublishEmailNotice {
  if (info.language === "es") {
    return {
      kind: "none",
      text: "Publishing does not email subscribers. When you are ready, send the Spanish email yourself from the Email subscribers box on this page. It goes only to subscribers who chose Español.",
    };
  }
  return {
    kind: "none",
    text: "Publishing does not email subscribers. When you are ready, send the email yourself from the Email subscribers box on this page.",
  };
}
