import { REVIEW_SUBJECTS, type ReviewSubjectKind } from "./review-subjects.ts";
import { button, escapeHtml } from "./subscription-email-content.ts";

// The email a Content Manager gets when the Administrator sends them something to review. It names the item
// and links to it; it never contains the content itself, which stays behind the Content Manager sign-in.

export type ReviewKind = ReviewSubjectKind;

/** The page a Content Manager opens to review this item. */
export function reviewPath(kind: ReviewKind, id: string) {
  return `/admin/cm/${REVIEW_SUBJECTS[kind].reviewFolder}/${encodeURIComponent(id)}`;
}

/** The longest note the Administrator can attach. It is meant to be a few sentences. */
export const REVIEW_NOTE_MAX_LENGTH = 600;

export function cleanReviewNote(value: unknown) {
  return typeof value === "string" ? value.replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, REVIEW_NOTE_MAX_LENGTH) : "";
}

export function buildReviewReadyEmail(input: { kind: ReviewKind; title: string; reviewUrl: string; recipientName?: string | null; senderName?: string | null; note?: string | null }) {
  const note = cleanReviewNote(input.note);
  const noteFrom = "A note from Brent";
  const label = REVIEW_SUBJECTS[input.kind].emailNoun;
  const title = input.title.trim() || `Untitled ${label}`;
  const greeting = input.recipientName?.trim() ? `Hello ${input.recipientName.trim()},` : "Hello,";
  const who = input.senderName?.trim() ? `${input.senderName.trim()} has` : "The Administrator has";
  const intro = `${who} sent you a ${label} to review. It is ready for you now.`;
  const how = "Open it, read it through, and propose any changes. Your edits are proposals only; nothing changes until the Administrator accepts them. When you are done, press Submit for Admin Review.";
  const subject = `Ready for your review: ${title}`;

  const html = `<!doctype html>
<html>
  <body style="margin:0;background:#f7f2e8;color:#243126;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f7f2e8;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#fffdf8;border:1px solid rgba(40,74,59,0.12);border-radius:18px;">
            <tr>
              <td style="padding:28px 24px;">
                <p style="margin:0 0 18px;color:#946332;font-size:12px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;">The Prayer Whiteboard</p>
                <p style="margin:0 0 14px;line-height:1.6;">${escapeHtml(greeting)}</p>
                <p style="margin:0 0 6px;line-height:1.6;">${escapeHtml(intro)}</p>
                <p style="margin:0 0 18px;font-size:19px;font-weight:700;line-height:1.35;color:#243d31;">${escapeHtml(title)}</p>
${note ? `                <div style="margin:0 0 22px;padding:14px 16px;background:#f4efe3;border-left:4px solid #946332;border-radius:8px;">
                  <p style="margin:0 0 6px;color:#946332;font-size:12px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;">${escapeHtml(noteFrom)}</p>
                  <p style="margin:0;line-height:1.6;color:#243126;">${escapeHtml(note).replace(/\n/g, "<br>")}</p>
                </div>
` : ""}                <p style="margin:0 0 22px;line-height:1.6;color:#385245;">${escapeHtml(how)}</p>
                <p style="margin:0 0 22px;text-align:center;">${button("Open it for review", input.reviewUrl)}</p>
                <p style="margin:0;line-height:1.6;color:#607066;font-size:13px;">You are receiving this because you are a Content Manager for The Prayer Whiteboard. You will need to sign in to see it.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [
    "THE PRAYER WHITEBOARD",
    "",
    greeting,
    "",
    intro,
    title,
    "",
    ...(note ? [`${noteFrom}:`, note, ""] : []),
    how,
    "",
    `Open it for review: ${input.reviewUrl}`,
    "",
    "You are receiving this because you are a Content Manager for The Prayer Whiteboard. You will need to sign in to see it.",
  ].join("\n");

  return { subject, html, text };
}
