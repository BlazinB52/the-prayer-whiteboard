import { button, escapeHtml } from "./subscription-email-content.ts";

// The email a Content Manager gets when the Administrator sends them something to review. It names the item
// and links to it; it never contains the content itself, which stays behind the Content Manager sign-in.

export type ReviewKind = "teaching" | "devotional" | "weekly_update";

export const REVIEW_KIND_LABEL: Record<ReviewKind, string> = {
  teaching: "teaching",
  devotional: "7-day devotional",
  weekly_update: "weekly update",
};

/** The page a Content Manager opens to review this item. */
export function reviewPath(kind: ReviewKind, id: string) {
  const folder = kind === "teaching" ? "teaching-review" : kind === "devotional" ? "devotional-review" : "weekly-update-review";
  return `/admin/cm/${folder}/${encodeURIComponent(id)}`;
}

export function buildReviewReadyEmail(input: { kind: ReviewKind; title: string; reviewUrl: string; recipientName?: string | null; senderName?: string | null }) {
  const label = REVIEW_KIND_LABEL[input.kind];
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
                <p style="margin:0 0 22px;line-height:1.6;color:#385245;">${escapeHtml(how)}</p>
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
    how,
    "",
    `Open it for review: ${input.reviewUrl}`,
    "",
    "You are receiving this because you are a Content Manager for The Prayer Whiteboard. You will need to sign in to see it.",
  ].join("\n");

  return { subject, html, text };
}
