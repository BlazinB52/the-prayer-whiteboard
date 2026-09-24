import { button, escapeHtml } from "./subscription-email-content.ts";

// The day link is resolved from the devotional's own slug rather than from a
// parent teaching's, so a series that is shared between teachings, or that has
// no teaching at all, still produces one stable URL. Used as the devotional's
// own public address, and as the email's read-more link when no teaching is
// assigned to link to instead.
export function devotionalDayUrl(baseUrl: string, devotionalSlug: string, dayNumber: number) {
  return `${baseUrl.replace(/\/+$/, "")}/devotionals/${encodeURIComponent(devotionalSlug)}/day/${dayNumber}`;
}

function field(title: string, bodyHtml: string) {
  return `<div style="margin:0 0 16px;padding:18px 20px;border:1px solid rgba(40,74,59,0.15);border-radius:14px;">
    <h2 style="margin:0 0 10px;color:#243d31;font-size:19px;line-height:1.25;">${escapeHtml(title)}</h2>
    ${bodyHtml}
  </div>`;
}

function scripturesFieldHtml(scriptures: string[]) {
  if (!scriptures.length) return "";
  return field("Anchor Scriptures", `<ul style="margin:0;padding-left:20px;line-height:1.7;">${scriptures.map((scripture) => `<li style="margin:0 0 8px;">${escapeHtml(scripture)}</li>`).join("")}</ul>`);
}

function textFieldHtml(title: string, text: string | null) {
  if (!text?.trim()) return "";
  const paragraphs = text.trim().split(/\n{2,}/).map((paragraph) => `<p style="margin:0 0 10px;line-height:1.7;">${escapeHtml(paragraph).replace(/\n/g, "<br />")}</p>`).join("");
  return field(title, paragraphs);
}

function scripturesText(scriptures: string[]) {
  if (!scriptures.length) return "";
  return `\nAnchor Scriptures\n${scriptures.map((scripture) => `- ${scripture}`).join("\n")}`;
}

function textFieldText(title: string, text: string | null) {
  if (!text?.trim()) return "";
  return `\n${title}\n${text.trim()}`;
}

export function buildDevotionalDayEmail(input: {
  dayNumber: number;
  totalDays?: number;
  title: string;
  seriesTitle: string;
  anchorScriptures: string[];
  devotionalReading: string | null;
  confession: string | null;
  journalPrompt: string | null;
  prayerActivation: string | null;
  readUrl: string;
  preferencesUrl: string;
}) {
  const totalDays = input.totalDays ?? 7;
  const dayLabel = `Day ${input.dayNumber} of ${totalDays}`;
  const scriptures = input.anchorScriptures.filter((scripture) => scripture.trim());
  const hasMoreDays = input.dayNumber < totalDays;

  const html = `<!doctype html>
<html>
  <body style="margin:0;background:#f7f2e8;color:#243126;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f7f2e8;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#fffdf8;border:1px solid rgba(40,74,59,0.12);border-radius:18px;">
            <tr>
              <td style="padding:28px 24px;">
                <p style="margin:0 0 4px;color:#946332;font-size:12px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;">The Prayer Whiteboard</p>
                <p style="margin:0 0 18px;color:#8a9a90;font-size:13px;">7-Day Devotional: ${escapeHtml(input.seriesTitle)}</p>
                <p style="margin:0 0 6px;color:#946332;font-size:12px;font-weight:800;letter-spacing:0.14em;text-transform:uppercase;">${escapeHtml(dayLabel.toUpperCase())}</p>
                <h1 style="margin:0 0 6px;color:#243d31;font-size:27px;line-height:1.2;">${escapeHtml(input.title)}</h1>
                <p style="margin:0 0 22px;color:#52645a;font-size:14px;font-style:italic;"><strong style="font-style:normal;">For</strong> ${escapeHtml(input.seriesTitle)}</p>
                ${scripturesFieldHtml(scriptures)}
                ${textFieldHtml("Devotional Reading", input.devotionalReading)}
                ${textFieldHtml("Today's Confession", input.confession)}
                ${textFieldHtml("5-Minute Journal Prompt", input.journalPrompt)}
                ${textFieldHtml("Prayer Activation Exercise", input.prayerActivation)}
                <p style="margin:22px 0 20px;">${button("Read the Full Teaching", input.readUrl)}</p>
                ${hasMoreDays ? `<p style="margin:0 0 20px;text-align:center;color:#8a9a90;font-size:13px;">Tomorrow: Day ${input.dayNumber + 1} of ${escapeHtml(input.seriesTitle)}</p>` : ""}
                <hr style="border:0;border-top:1px solid rgba(40,74,59,0.15);margin:0 0 16px;" />
                <p style="margin:0 0 6px;text-align:center;color:#243d31;font-size:13px;font-weight:800;">The Prayer Whiteboard</p>
                <p style="margin:0 0 16px;text-align:center;color:#8a9a90;font-size:12px;">Prayer &bull; Scripture &bull; Teaching &bull; Devotion</p>
                <p style="margin:0;line-height:1.65;color:#607066;font-size:13px;text-align:center;">You are receiving this because you subscribed to a Prayer Whiteboard devotional series. <a href="${escapeHtml(input.preferencesUrl)}" style="color:#244a3a;">Manage your email preferences or unsubscribe</a>.</p>
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
    `7-Day Devotional: ${input.seriesTitle}`,
    "",
    dayLabel.toUpperCase(),
    input.title,
    `For ${input.seriesTitle}`,
    scripturesText(scriptures),
    textFieldText("Devotional Reading", input.devotionalReading),
    textFieldText("Today's Confession", input.confession),
    textFieldText("5-Minute Journal Prompt", input.journalPrompt),
    textFieldText("Prayer Activation Exercise", input.prayerActivation),
    "",
    "Read the Full Teaching:",
    input.readUrl,
    hasMoreDays ? `\nTomorrow: Day ${input.dayNumber + 1} of ${input.seriesTitle}` : "",
    "",
    "---",
    "You are receiving this because you subscribed to a Prayer Whiteboard devotional series.",
    `Manage your email preferences or unsubscribe: ${input.preferencesUrl}`,
  ].filter((line) => line !== "").join("\n");

  return { subject: `${dayLabel} — ${input.title}`, html, text };
}
