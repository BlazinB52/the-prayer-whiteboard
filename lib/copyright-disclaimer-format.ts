import { escapeHtml } from "./subscription-email-content.ts";

export const COPYRIGHT_DISCLAIMER_PATH = "/copyright-disclaimers";

export const FALLBACK_FULL_PAGE_COPYRIGHT_DISCLAIMER = `Scripture quotations taken from The Holy Bible, New International Version®, NIV® Copyright © 1973, 1978, 1984, 2011 by Biblica, Inc.® Used by permission. All rights reserved worldwide.

Scripture quotations are from the ESV® Bible (The Holy Bible, English Standard Version®), copyright © 2001 by Crossway, a publishing ministry of Good News Publishers. Used by permission. All rights reserved.

Scripture quotations taken from the Amplified® Bible (AMP), Copyright © 2015 by The Lockman Foundation. Used by permission. https://www.lockman.org

Scripture quotations marked (AMPC) taken from the Amplified® Bible, Classic Edition, Copyright © 1954, 1958, 1962, 1964, 1965, 1987 by The Lockman Foundation. Used by permission. https://www.lockman.org

Scripture taken from the New King James Version®. Copyright © 1982 by Thomas Nelson. Used by permission. All rights reserved.

Scripture quotations marked (KJV) are taken from the King James Version, which is in the public domain in the United States.

Original commentary, organization, editorial content, and presentation © 2026 The Prayer Whiteboard. All rights reserved. Scripture quotations and any underlying third-party teaching material remain the property of their respective copyright holders.`;

export const FALLBACK_EMAIL_COPYRIGHT_DISCLAIMER = `Scripture quotations are from the NIV, ESV, NKJV, AMP, and AMPC Bibles. Complete copyright acknowledgments and permissions can be viewed here.

Original Content © 2026 The Prayer Whiteboard. All rights reserved.`;

export const SPANISH_COPYRIGHT_DISCLAIMER_PATH = "/espanol/derechos-de-autor";

// Used only if the managed Español short footer cannot be read. Mirrors that footer: the only two
// Spanish versions the site quotes (RVR1960 and NVI), with each publisher's prescribed acknowledgment.
export const FALLBACK_EMAIL_COPYRIGHT_DISCLAIMER_ES = `Las citas bíblicas son de la Reina-Valera 1960 (RVR1960) y de la Nueva Versión Internacional (NVI). Los reconocimientos de derechos de autor completos se pueden ver aquí.

RVR1960: Reina-Valera © 1960 Sociedades Bíblicas en América Latina; © renovado 1988 Sociedades Bíblicas Unidas. Utilizado con permiso. Reina-Valera 1960® es una marca registrada de Sociedades Bíblicas Unidas, y se puede usar solamente bajo licencia.

NVI: Santa Biblia, Nueva Versión Internacional® NVI® © 1999, 2015, 2022 por Biblica, Inc.® Usado con permiso de Biblica, Inc.® Reservados todos los derechos en todo el mundo.

Contenido original © 2026 The Prayer Whiteboard. Todos los derechos reservados.`;

export type DisclaimerLanguage = "en" | "es";

const LOCKMAN_FOUNDATION_URL = "https://www.lockman.org";
const HERE_OR_AMPLIFIED_TAG_PATTERN = /\bhere\b|\bAMPC?\b/g;
// \b does not treat the accented "í" as a word character, so "aquí" needs its own boundary test.
const SPANISH_HERE_PATTERN = /(?<![\p{L}])aquí(?![\p{L}])/gu;

export type CopyrightDisclaimerKey = "full_page" | "email_short";

export type EmailCopyrightDisclaimer = {
  content: string;
  pageUrl: string;
  html: string;
  text: string;
};

export function canonicalCopyrightDisclaimerUrl(baseUrl: string, language: DisclaimerLanguage = "en") {
  return `${baseUrl.replace(/\/+$/, "")}${language === "es" ? SPANISH_COPYRIGHT_DISCLAIMER_PATH : COPYRIGHT_DISCLAIMER_PATH}`;
}

export function safeCopyrightReturnToPath(value: unknown) {
  const path = String(value ?? "").trim();
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\") || /^\/?https?:/i.test(path)) return null;
  return path;
}

export function buildEmailCopyrightDisclaimer(content: string, pageUrl: string, language: DisclaimerLanguage = "en"): EmailCopyrightDisclaimer {
  return {
    content,
    pageUrl,
    html: renderCopyrightDisclaimerEmailHtml(content, pageUrl, language),
    text: renderCopyrightDisclaimerEmailText(content, pageUrl, language),
  };
}

export function renderCopyrightDisclaimerEmailHtml(content: string, pageUrl: string, language: DisclaimerLanguage = "en") {
  const paragraphs = disclaimerParagraphs(content);
  if (!paragraphs.length) return "";

  return `<div style="margin:18px 0 0;padding-top:14px;border-top:1px solid rgba(40,74,59,0.12);color:#7a8a80;font-size:11px;line-height:1.55;">${paragraphs
    .map((paragraph) => `<p style="margin:0 0 8px;">${renderCopyrightDisclaimerInlineHtml(paragraph, pageUrl, language)}</p>`)
    .join("")}</div>`;
}

export function renderCopyrightDisclaimerEmailText(content: string, pageUrl: string, language: DisclaimerLanguage = "en") {
  return disclaimerParagraphs(content).map((paragraph) => injectCopyrightDisclaimerLinkText(paragraph, pageUrl, language)).join("\n\n");
}

function disclaimerParagraphs(content: string) {
  return content.replace(/\r\n?/g, "\n").split(/\n{2,}/).map((paragraph) => paragraph.trim()).filter(Boolean);
}

function renderCopyrightDisclaimerInlineHtml(paragraph: string, pageUrl: string, language: DisclaimerLanguage) {
  const pattern = language === "es" ? SPANISH_HERE_PATTERN : HERE_OR_AMPLIFIED_TAG_PATTERN;
  let result = "";
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  pattern.lastIndex = 0;
  while ((match = pattern.exec(paragraph)) !== null) {
    result += escapeHtml(paragraph.slice(lastIndex, match.index));
    // Spanish: the only link is "aquí" to the Español copyright page. English also links AMP/AMPC to Lockman.
    const linksToPage = language === "es" || match[0] === "here";
    result += linksToPage
      ? `<a href="${escapeHtml(pageUrl)}">${escapeHtml(match[0])}</a>`
      : `<a href="${escapeHtml(LOCKMAN_FOUNDATION_URL)}">${escapeHtml(match[0])}</a>`;
    lastIndex = match.index + match[0].length;
  }

  return result + escapeHtml(paragraph.slice(lastIndex));
}

function injectCopyrightDisclaimerLinkText(paragraph: string, pageUrl: string, language: DisclaimerLanguage) {
  // A plain-text email cannot carry a link, so write the address out after the link word.
  if (language === "es") return paragraph.replace(SPANISH_HERE_PATTERN, (word) => `${word}:\n${pageUrl}`);

  let result = paragraph;
  if (/\bhere\b/.test(result)) result = result.replace(/\bhere\b/, `here:\n${pageUrl}`);
  result = result.replace(/\bAMPC?\b/g, (tag) => `${tag} (see ${LOCKMAN_FOUNDATION_URL})`);
  return result;
}
