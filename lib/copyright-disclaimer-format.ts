import { escapeHtml } from "./subscription-email-content.ts";

export const COPYRIGHT_DISCLAIMER_PATH = "/copyright-disclaimers";

export const FALLBACK_FULL_PAGE_COPYRIGHT_DISCLAIMER = `Scripture quotations taken from The Holy Bible, New International Version®, NIV® Copyright © 1973, 1978, 1984, 2011 by Biblica, Inc.® Used by permission. All rights reserved worldwide.

Scripture quotations are from the ESV® Bible (The Holy Bible, English Standard Version®), copyright © 2001 by Crossway, a publishing ministry of Good News Publishers. Used by permission. All rights reserved.

Scripture quotations taken from the Amplified® Bible (AMP), Copyright © 2015 by The Lockman Foundation. Used by permission. https://www.lockman.org

Scripture quotations marked (AMPC) taken from the Amplified® Bible, Classic Edition, Copyright © 1954, 1958, 1962, 1964, 1965, 1987 by The Lockman Foundation. Used by permission. https://www.lockman.org

Scripture taken from the New King James Version®. Copyright © 1982 by Thomas Nelson. Used by permission. All rights reserved.

Scripture quotations marked (KJV) are taken from the King James Version, which is in the public domain in the United States.

Original commentary, organization, editorial content, and presentation © 2026 The Prayer Whiteboard. All rights reserved. Scripture quotations and any underlying third-party teaching material remain the property of their respective copyright holders.`;

export const FALLBACK_EMAIL_COPYRIGHT_DISCLAIMER = `Scripture quotations are from the NIV, ESV, NKJV, and AMP Bibles. Complete copyright acknowledgments and permissions can be viewed here.

Original Content © 2026 The Prayer Whiteboard. All rights reserved.`;

export type CopyrightDisclaimerKey = "full_page" | "email_short";

export type EmailCopyrightDisclaimer = {
  content: string;
  pageUrl: string;
  html: string;
  text: string;
};

export function canonicalCopyrightDisclaimerUrl(baseUrl: string) {
  return `${baseUrl.replace(/\/+$/, "")}${COPYRIGHT_DISCLAIMER_PATH}`;
}

export function safeCopyrightReturnToPath(value: unknown) {
  const path = String(value ?? "").trim();
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\") || /^\/?https?:/i.test(path)) return null;
  return path;
}

export function buildEmailCopyrightDisclaimer(content: string, pageUrl: string): EmailCopyrightDisclaimer {
  return {
    content,
    pageUrl,
    html: renderCopyrightDisclaimerEmailHtml(content, pageUrl),
    text: renderCopyrightDisclaimerEmailText(content, pageUrl),
  };
}

export function renderCopyrightDisclaimerEmailHtml(content: string, pageUrl: string) {
  const paragraphs = disclaimerParagraphs(content);
  if (!paragraphs.length) return "";

  return `<div style="margin:18px 0 0;padding-top:14px;border-top:1px solid rgba(40,74,59,0.12);color:#7a8a80;font-size:11px;line-height:1.55;">${paragraphs
    .map((paragraph) => `<p style="margin:0 0 8px;">${renderCopyrightDisclaimerInlineHtml(paragraph, pageUrl)}</p>`)
    .join("")}</div>`;
}

export function renderCopyrightDisclaimerEmailText(content: string, pageUrl: string) {
  return disclaimerParagraphs(content).map((paragraph) => injectCopyrightDisclaimerLinkText(paragraph, pageUrl)).join("\n\n");
}

function disclaimerParagraphs(content: string) {
  return content.replace(/\r\n?/g, "\n").split(/\n{2,}/).map((paragraph) => paragraph.trim()).filter(Boolean);
}

function renderCopyrightDisclaimerInlineHtml(paragraph: string, pageUrl: string) {
  const herePattern = /\bhere\b/;
  const hereMatch = herePattern.exec(paragraph);
  if (hereMatch?.index !== undefined) {
    const before = paragraph.slice(0, hereMatch.index);
    const after = paragraph.slice(hereMatch.index + hereMatch[0].length);
    return `${escapeHtml(before)}<a href="${escapeHtml(pageUrl)}">here</a>${escapeHtml(after)}`;
  }

  return escapeHtml(paragraph);
}

function injectCopyrightDisclaimerLinkText(paragraph: string, pageUrl: string) {
  return /\bhere\b/.test(paragraph) ? paragraph.replace(/\bhere\b/, `here:\n${pageUrl}`) : paragraph;
}
