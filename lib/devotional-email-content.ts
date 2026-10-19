import { button, escapeHtml } from "./subscription-email-content.ts";
import { formattedBlocksHtml, formattedBlocksText, formattedInlineHtml, formattedInlineText } from "./formatted-email-text.ts";
import type { EmailCopyrightDisclaimer } from "./copyright-disclaimer-format.ts";
import { groupScriptureEntries, stripWrappingQuotes, type ScriptureEntry } from "./anchor-scripture-format.ts";
import { COMMUNION_HEADS_UP_DAY_NUMBER, devotionalDaySections, type DevotionalDay } from "./devotionals.ts";
import { ui, type Language } from "./i18n.ts";

// Wording the email adds around the devotional's own text. Español uses the Salvadoran voseo, like the Español
// teaching and weekly update emails.
const COPY = {
  en: {
    forSeries: "For",
    readButton: "Read the Full Teaching",
    readTextLink: "Read the Full Teaching:",
    tomorrow: (day: number, series: string) => `Tomorrow: Day ${day} of ${series}`,
    tagline: "Prayer &bull; Scripture &bull; Teaching &bull; Devotion",
    reason: "You are receiving this because you subscribed to a Prayer Whiteboard devotional series.",
    manage: "Manage your email preferences or unsubscribe",
  },
  es: {
    forSeries: "Para",
    readButton: "Leer la enseñanza completa",
    readTextLink: "Leé la enseñanza completa:",
    tomorrow: (day: number, series: string) => `Mañana: Día ${day} de ${series}`,
    tagline: "Oración &bull; Escritura &bull; Enseñanza &bull; Devoción",
    reason: "Recibís este mensaje porque te suscribiste a una serie devocional de Prayer Whiteboard.",
    manage: "Administrá tus preferencias de correo o cancelá tu suscripción",
  },
} as const;

// The devotional's own public address for a day, built from its own slug so a series that is
// shared between teachings, or has no teaching at all, still has one stable URL. The email does
// not link here: its button reads through to the teaching.
export function devotionalDayUrl(baseUrl: string, devotionalSlug: string, dayNumber: number) {
  return `${baseUrl.replace(/\/+$/, "")}/devotionals/${encodeURIComponent(devotionalSlug)}/day/${dayNumber}`;
}

function field(title: string, bodyHtml: string) {
  return `<div style="margin:0 0 16px;padding:18px 20px;border:1px solid rgba(40,74,59,0.15);border-radius:14px;">
    <h2 style="margin:0 0 10px;color:#243d31;font-size:19px;line-height:1.25;">${escapeHtml(title)}</h2>
    ${bodyHtml}
  </div>`;
}

function scripturesFieldHtml(scriptures: string[], label: string) {
  if (!scriptures.length) return "";
  // The standard verse style: bold reference, the verse directly under it in italics, gold line on the left.
  return field(label, groupScriptureEntries(scriptures).map((entry) => `<div style="margin:0 0 18px;padding-left:16px;border-left:4px solid #c99a52;">${entry.reference ? `<p style="margin:0 0 4px;font-weight:700;line-height:1.5;">${formattedInlineHtml(entry.reference)}</p>` : ""}${entry.quote ? `<p style="margin:0;font-style:italic;line-height:1.7;">${formattedInlineHtml(stripWrappingQuotes(entry.quote))}</p>` : ""}</div>`).join(""));
}

function textFieldHtml(title: string, text: string | null) {
  if (!text?.trim()) return "";
  return field(title, formattedBlocksHtml(text));
}

function scripturesText(scriptures: string[], label: string) {
  if (!scriptures.length) return "";
  const verse = (entry: ScriptureEntry) => {
    if (!entry.reference) return `  ${formattedInlineText(entry.quote)}`;
    const reference = `  ${formattedInlineText(entry.reference)}`;
    return entry.quote ? `${reference}\n  ${formattedInlineText(stripWrappingQuotes(entry.quote))}` : reference;
  };
  return `\n${label}\n${groupScriptureEntries(scriptures).map(verse).join("\n\n")}`;
}

function textFieldText(title: string, text: string | null) {
  if (!text?.trim()) return "";
  return `\n${title}\n${formattedBlocksText(text)}`;
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
  // Day 7 only (the Communion and rest day). A Day 7 with none of these mails in its old layout.
  breadReflection?: string | null;
  cupReflection?: string | null;
  selfExamination?: string | null;
  seriesClosingPrayer?: string | null;
  // True on Day 6 when Day 7 is a Communion day, so the email reminds the reader to have bread and juice ready.
  communionTomorrow?: boolean;
  // The published teaching's address. Absent when the devotional has no published teaching, and the button is left out.
  readUrl?: string | null;
  preferencesUrl: string;
  copyrightDisclaimer?: EmailCopyrightDisclaimer;
  // The series' own language picks the wording; English when absent.
  language?: Language;
}) {
  const language: Language = input.language === "es" ? "es" : "en";
  const words = COPY[language];
  const copy = ui(language);
  const totalDays = input.totalDays ?? 7;
  const dayLabel = language === "es" ? `Día ${input.dayNumber} de ${totalDays}` : `Day ${input.dayNumber} of ${totalDays}`;
  const scriptures = input.anchorScriptures.filter((scripture) => scripture.trim());
  const hasMoreDays = input.dayNumber < totalDays;
  // The same section list the website uses, so the email and the page never disagree about Day 7.
  const sections = devotionalDaySections({
    id: "",
    devotional_id: "",
    day_number: input.dayNumber,
    title: input.title,
    anchor_scriptures: scriptures,
    devotional_reading: input.devotionalReading,
    confession: input.confession,
    journal_prompt: input.journalPrompt,
    prayer_activation: input.prayerActivation,
    bread_reflection: input.breadReflection ?? null,
    cup_reflection: input.cupReflection ?? null,
    self_examination: input.selfExamination ?? null,
    series_closing_prayer: input.seriesClosingPrayer ?? null,
  } satisfies DevotionalDay, copy).filter((section) => !section.isScriptures);
  // Only the day before Communion carries the reminder, whatever the caller passes.
  const showCommunionHeadsUp = Boolean(input.communionTomorrow) && input.dayNumber === COMMUNION_HEADS_UP_DAY_NUMBER;
  const communionHeadsUpHtml = showCommunionHeadsUp
    ? `<div style="margin:0 0 16px;padding:16px 20px;border-left:4px solid #c99a52;background:#fbf4e4;border-radius:10px;">
    <p style="margin:0 0 4px;color:#243d31;font-size:16px;font-weight:800;line-height:1.4;">${escapeHtml(copy.communionTomorrowTitle)}</p>
    <p style="margin:0;color:#52645a;line-height:1.65;">${escapeHtml(copy.communionTomorrow)}</p>
  </div>`
    : "";

  const html = `<!doctype html>
<html lang="${language}">
  <body style="margin:0;background:#f7f2e8;color:#243126;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f7f2e8;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#fffdf8;border:1px solid rgba(40,74,59,0.12);border-radius:18px;">
            <tr>
              <td style="padding:28px 24px;">
                <p style="margin:0 0 4px;color:#946332;font-size:12px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;">The Prayer Whiteboard</p>
                <p style="margin:0 0 18px;color:#8a9a90;font-size:13px;">${escapeHtml(input.seriesTitle)}</p>
                <p style="margin:0 0 6px;color:#946332;font-size:12px;font-weight:800;letter-spacing:0.14em;text-transform:uppercase;">${escapeHtml(dayLabel.toUpperCase())}</p>
                <h1 style="margin:0 0 6px;color:#243d31;font-size:23px;line-height:1.2;">${escapeHtml(input.title)}</h1>
                <p style="margin:0 0 22px;color:#52645a;font-size:14px;font-style:italic;"><strong style="font-style:normal;">${words.forSeries}</strong> ${escapeHtml(input.seriesTitle)}</p>
                ${scripturesFieldHtml(scriptures, copy.anchorScriptures)}
                ${sections.map((section) => textFieldHtml(section.label, section.text)).join("")}
                ${communionHeadsUpHtml}
                ${input.readUrl ? `<p style="margin:22px 0 20px;text-align:center;">${button(words.readButton, input.readUrl)}</p>` : `<div style="height:22px;"></div>`}
                ${hasMoreDays ? `<p style="margin:0 0 20px;text-align:center;color:#8a9a90;font-size:13px;">${escapeHtml(words.tomorrow(input.dayNumber + 1, input.seriesTitle))}</p>` : ""}
                <hr style="border:0;border-top:1px solid rgba(40,74,59,0.15);margin:0 0 16px;" />
                <p style="margin:0 0 6px;text-align:center;color:#243d31;font-size:13px;font-weight:800;">The Prayer Whiteboard</p>
                <p style="margin:0 0 16px;text-align:center;color:#8a9a90;font-size:12px;">${words.tagline}</p>
                <p style="margin:0;line-height:1.65;color:#607066;font-size:13px;text-align:center;">${words.reason} <a href="${escapeHtml(input.preferencesUrl)}" style="color:#244a3a;">${words.manage}</a>.</p>
                ${input.copyrightDisclaimer?.html ?? ""}
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
    input.seriesTitle,
    "",
    dayLabel.toUpperCase(),
    input.title,
    `${words.forSeries} ${input.seriesTitle}`,
    scripturesText(scriptures, copy.anchorScriptures),
    ...sections.map((section) => textFieldText(section.label, section.text)),
    showCommunionHeadsUp ? `\n${copy.communionTomorrowTitle} ${copy.communionTomorrow}` : "",
    input.readUrl ? `
${words.readTextLink}
${input.readUrl}` : "",
    hasMoreDays ? `\n${words.tomorrow(input.dayNumber + 1, input.seriesTitle)}` : "",
    "",
    "---",
    words.reason,
    `${words.manage}: ${input.preferencesUrl}`,
    input.copyrightDisclaimer?.text ? `\n${input.copyrightDisclaimer.text}` : "",
  ].filter((line) => line !== "").join("\n");

  return { subject: `${dayLabel} — ${input.title}`, html, text };
}
