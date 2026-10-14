// "Convert & Save Spanish Version": translates an English teaching into Español (El Salvador, voseo) with
// the Claude API and hands the result to the same Word exporter and importer that a hand translation goes
// through, so the new draft is stored, validated and displayed exactly like an imported Spanish teaching.
//
// Only text is sent: the title, Central Theme, Introduction, Short Summary, homepage teasers, category and
// section titles, and section text. Labels, ids, formats and links never leave as something to translate,
// so the structure cannot change. Scripture quotations come back as the Reina-Valera 1960 text for the
// passage and are listed for a person to check before publishing.

import type { ExportCategory, ExportSection, ExportTeaching } from "./teaching-docx-export.ts";
import { TEACHING_IMPORT_LIMITS } from "./teaching-docx-import.ts";

export type TranslationSegmentKind = "heading" | "text" | "scripture_reference" | "scripture_verse";
export type TranslationSegment = { id: string; kind: TranslationSegmentKind; text: string; note?: string; limit?: number };

export type AutoTranslateOptions = {
  apiKey: string;
  model?: string;
  fetchImpl?: typeof fetch;
  /** How many requests run at once. Each category is one request, plus one for the title and summary fields. */
  concurrency?: number;
};

export type ScriptureToCheck = { english: string; reference: string; quotation: string };

export type AutoTranslateResult = {
  teaching: ExportTeaching;
  categories: ExportCategory[];
  sections: ExportSection[];
  warnings: string[];
  scriptures: ScriptureToCheck[];
};

export const DEFAULT_TRANSLATION_MODEL = "claude-opus-5-5";
export const SPANISH_SCRIPTURE_VERSION = "RVR1960";
const API_URL = "https://api.anthropic.com/v1/messages";
const MAX_OUTPUT_TOKENS = 32000;

/**
 * The site's own field limits (the Español importer and the database). Text is never shortened to fit them: a
 * translation that runs over stops the save with a message naming the field, and nothing is cut.
 */
export const SPANISH_FIELD_LIMITS = {
  title: TEACHING_IMPORT_LIMITS.title,
  centralTheme: TEACHING_IMPORT_LIMITS.centralTheme,
  introduction: TEACHING_IMPORT_LIMITS.introduction,
  summary: TEACHING_IMPORT_LIMITS.summary,
  teaserHeading: TEACHING_IMPORT_LIMITS.teaserHeading,
  teaserText: TEACHING_IMPORT_LIMITS.teaserText,
  heading: Math.min(TEACHING_IMPORT_LIMITS.categoryTitle, TEACHING_IMPORT_LIMITS.sectionTitle),
  sectionText: TEACHING_IMPORT_LIMITS.sectionText,
} as const;

/** The rules in "Spanish Translation Rules — The Prayer Whiteboard", written for the model. */
export function translationSystemPrompt() {
  return `You are a professional theological translator for The Prayer Whiteboard, a prayer ministry website. You translate teachings from English into Español de El Salvador for Salvadoran readers in evangelical and Spirit-filled churches. The wording is natural, warm and professional.

FAITHFULNESS
- Preserve the source's meaning, theological intent, tone and degree of certainty. Do not add doctrine, strengthen claims or soften them, and do not embellish prophetic words.
- Translate everything; add nothing (no notes, explanations or bracketed comments) and leave nothing out.

ADDRESSING PEOPLE
- Addressing one person: always vos with its matching conjugations, including imperatives and subjunctives: vos sos, tenés, podés, elegí, suscribite, acercate, quedate, mirá, orá, que querás, que confirmés, que notés. Keep tu / tus and te where grammatically appropriate. Never use tú forms (tienes, puedes, acércate, mira as a command).
- Addressing more than one person: ustedes (vengan, quédense, manténganse). Never vosotros.
- Prophetic words: keep exactly whom the English addresses. If the word speaks to one person, use vos; if it speaks to the whole group, use ustedes.
- Prayers addressed to God use vos: "Señor, ungí mis ojos", "Padre, ensanchá nuestro corazón", "Enseñanos", "Hacenos atentos".

THE TEACHER
- Follow the English. When it says "he" or "she" about the teacher ("the teacher said…", "she went on to say…"), keep that gender in Spanish: él / ella, el maestro / la maestra (or el docente / la docente), with matching articles and adjectives.
- When the English says only "the teacher" and gives no gender, do not add one. Use natural neutral constructions: "En la enseñanza se explicó…", "La enseñanza relacionó…", "Se recordó…", "Para ilustrarlo, se contó…", "Se dieron gracias a Jesús…". Do not use la maestra, el maestro, ella or él unless the English gives the gender.
- Never guess a gender from a name or from the context. Use only what the English states.

WORDING
- The small prayer group: el grupo or los participantes, never la congregación.
- A spiritual prompting: un impulso or una dirección del Espíritu Santo, whichever fits the context. Avoid "inquietud" because it can suggest worry.
- Communion with the bread and the cup: la Santa Cena. Spiritual fellowship: comunión ("comunión con Dios"). Never call the Lord's Supper "la Comunión".
- Holy Spirit: el Espíritu Santo, always with the article.
- Feminine nouns that begin with a stressed a- take el / un in the singular: un ama de casa, el agua, el alma.
- Bible books use their Spanish names (Génesis, Isaías, Hageo, Santiago, 1 Corintios, 1 Juan). When an English sentence spells out an ordinal ("First Corinthians 6:17 says"), write "Primera de Corintios 6:17 dice".
- Keep people's names and places as they are (Oklahoma City, Kenneth Copeland).

CAPITALIZATION FOR GOD
- Capitalize pronouns and possessives that refer to God the Father, Jesus or the Holy Spirit: Él, Su, Sus, Tu, Tus, Vos, Mí, Mi, Mis, Yo, Sí mismo. Leave object pronouns lowercase (lo, le, te, nos). Do not capitalize pronouns that refer to people.

HEADINGS (segments of kind "heading")
- Use the site's title case: capitalize every main word, including verbs, nouns, adjectives, adverbs, possessives and "No"; keep articles, prepositions and conjunctions lowercase unless they are the first word (el, la, los, las, un, una, de, del, a, al, en, con, por, para, sin, y, o, que, lo, se).
- Examples from the live site: "Palabra Profética para el Grupo", "Mantené Tus Ojos en Jesús", "Jesús Es Nuestro Modelo", "Oración Final".
- All other text uses normal Spanish sentence case.

FORMATTING
- Preserve the structure, **bold**, *italic* and [link text](https://address) markup exactly: translate the words inside, keep every address unchanged, and keep the same number of ** and * markers.
- Keep line breaks: a segment with N lines comes back with N lines, in the same order.
- Use curly double quotes “ ” for quotations and single quotes ' ' for a quotation inside a quotation. Use ¿ ? and ¡ ! correctly.

COMPLETENESS
- Translate every segment in full. Never shorten, summarize, condense or cut text, whatever its length.

SCRIPTURE
- Preserve every Scripture reference. "scripture_reference" segments: translate only the book name ("2 Corinthians 3:16-18" → "2 Corintios 3:16-18"); do not add a version. The site labels these quotations RVR1960.
- "scripture_verse" segments: do not translate the English. Write the passage exactly as published in the Reina-Valera 1960 (RVR1960) for the reference in the segment's note, as written, with no voseo and no other changes. Never present your own translation of the English as a published Bible version. Do not add quotation marks around the whole passage.

OUTPUT
- Call the save_translation tool once with every segment id you were given, each with its translated text.`;
}

const SAVE_TOOL = {
  name: "save_translation",
  description: "Save the Spanish (El Salvador) translation of every segment.",
  input_schema: {
    type: "object",
    properties: {
      segments: {
        type: "array",
        items: {
          type: "object",
          properties: { id: { type: "string" }, text: { type: "string" } },
          required: ["id", "text"],
        },
      },
    },
    required: ["segments"],
  },
} as const;

const text = (value: unknown) => String(value ?? "").replace(/\r\n?/g, "\n").trim();

/** The website field a segment fills, for limits and messages. */
export function fieldLabel(id: string) {
  const named: Record<string, string> = {
    "teaching.title": "Title",
    "teaching.central_theme": "Central Theme",
    "teaching.introduction": "Introduction",
    "teaching.summary": "Short Summary",
    "teaching.teaser_1_heading": "Homepage Teaser 1 Heading",
    "teaching.teaser_1_text": "Homepage Teaser 1 Text",
    "teaching.teaser_2_heading": "Homepage Teaser 2 Heading",
    "teaching.teaser_2_text": "Homepage Teaser 2 Text",
  };
  if (named[id]) return named[id];
  if (id.startsWith("category.")) return "A category title";
  if (id === "handout.title") return "The handout title";
  if (id.startsWith("handout.")) return "A part of the handout";
  if (id.endsWith(".title")) return "A section title";
  return "A section";
}

function limitFor(id: string, kind: TranslationSegmentKind): number | undefined {
  const byId: Record<string, number> = {
    "teaching.title": SPANISH_FIELD_LIMITS.title,
    "teaching.central_theme": SPANISH_FIELD_LIMITS.centralTheme,
    "teaching.introduction": SPANISH_FIELD_LIMITS.introduction,
    "teaching.summary": SPANISH_FIELD_LIMITS.summary,
    "teaching.teaser_1_heading": SPANISH_FIELD_LIMITS.teaserHeading,
    "teaching.teaser_1_text": SPANISH_FIELD_LIMITS.teaserText,
    "teaching.teaser_2_heading": SPANISH_FIELD_LIMITS.teaserHeading,
    "teaching.teaser_2_text": SPANISH_FIELD_LIMITS.teaserText,
  };
  if (byId[id]) return byId[id];
  if (kind === "heading") return SPANISH_FIELD_LIMITS.heading;
  if (kind === "text") return SPANISH_FIELD_LIMITS.sectionText;
  return undefined;
}

type Collected = {
  groups: TranslationSegment[][];
  apply: (translated: Map<string, string>) => { teaching: ExportTeaching; categories: ExportCategory[]; sections: ExportSection[]; scriptures: ScriptureToCheck[] };
};

/** Splits a teaching into translatable text segments: one group for the teaching's own fields, then one group per category. */
export function collectSegments(teaching: ExportTeaching, categories: ExportCategory[], sections: ExportSection[]): Collected {
  const header: TranslationSegment[] = [];
  const add = (group: TranslationSegment[], id: string, kind: TranslationSegmentKind, value: unknown, note?: string) => {
    const t = text(value);
    if (!t) return;
    const segment: TranslationSegment = { id, kind, text: t };
    if (note) segment.note = note;
    const limit = limitFor(id, kind);
    if (limit) segment.limit = limit;
    group.push(segment);
  };

  add(header, "teaching.title", "heading", teaching.title);
  add(header, "teaching.central_theme", "text", teaching.central_theme);
  add(header, "teaching.introduction", "text", teaching.introduction);
  add(header, "teaching.summary", "text", teaching.summary);
  add(header, "teaching.teaser_1_heading", "heading", teaching.teaser_1_heading);
  add(header, "teaching.teaser_1_text", "text", teaching.teaser_1_text);
  add(header, "teaching.teaser_2_heading", "heading", teaching.teaser_2_heading);
  add(header, "teaching.teaser_2_text", "text", teaching.teaser_2_text);

  const orderedCategories = [...categories].sort((a, b) => a.sort_order - b.sort_order);
  const groups: TranslationSegment[][] = [header];
  for (const category of orderedCategories) {
    const group: TranslationSegment[] = [];
    add(group, `category.${category.id}.title`, "heading", category.title);
    for (const section of sections.filter((item) => item.category_id === category.id).sort((a, b) => a.sort_order - b.sort_order)) {
      const content = section.content && typeof section.content === "object" ? (section.content as Record<string, unknown>) : {};
      const key = `section.${section.id}`;
      if (content.showTitle !== false) add(group, `${key}.title`, "heading", section.title);
      const format = String(content.format ?? "paragraph");
      if (format === "bullets") {
        add(group, `${key}.introduction`, "text", content.introduction);
        (Array.isArray(content.bullets) ? content.bullets : []).forEach((bullet, index) => add(group, `${key}.bullets.${index}`, "text", bullet));
        add(group, `${key}.conclusion`, "text", content.conclusion);
      } else if (format === "scripture") {
        add(group, `${key}.introduction`, "text", content.introduction);
        add(group, `${key}.reference`, "scripture_reference", content.reference);
        add(group, `${key}.quotation`, "scripture_verse", content.quotation, `Passage: ${text(content.reference)}. English (${text(content.translation)}) shown only so you know which verses; write the RVR1960 text instead.`);
      } else {
        add(group, `${key}.text`, "text", content.text);
      }
    }
    if (group.length) groups.push(group);
  }

  const apply: Collected["apply"] = (translated) => {
    const pick = (id: string, fallback: unknown) => (translated.has(id) ? translated.get(id)! : (fallback as string | null));
    const newTeaching: ExportTeaching = {
      ...teaching,
      title: pick("teaching.title", teaching.title) ?? "",
      central_theme: pick("teaching.central_theme", teaching.central_theme),
      introduction: pick("teaching.introduction", teaching.introduction),
      summary: pick("teaching.summary", teaching.summary),
      teaser_1_heading: pick("teaching.teaser_1_heading", teaching.teaser_1_heading),
      teaser_1_text: pick("teaching.teaser_1_text", teaching.teaser_1_text),
      teaser_2_heading: pick("teaching.teaser_2_heading", teaching.teaser_2_heading),
      teaser_2_text: pick("teaching.teaser_2_text", teaching.teaser_2_text),
      language: "es",
    };
    const newCategories = categories.map((category) => ({ ...category, title: pick(`category.${category.id}.title`, category.title) ?? "" }));
    const scriptures: ScriptureToCheck[] = [];
    const newSections = sections.map((section) => {
      const content = section.content && typeof section.content === "object" ? { ...(section.content as Record<string, unknown>) } : {};
      const key = `section.${section.id}`;
      const format = String(content.format ?? "paragraph");
      for (const field of ["text", "introduction", "conclusion", "reference", "quotation"]) {
        if (translated.has(`${key}.${field}`)) content[field] = translated.get(`${key}.${field}`);
      }
      if (Array.isArray(content.bullets)) content.bullets = content.bullets.map((bullet, index) => pick(`${key}.bullets.${index}`, bullet));
      if (format === "scripture") {
        const english = `${text((section.content as Record<string, unknown>)?.reference)} (${text((section.content as Record<string, unknown>)?.translation)})`;
        content.translation = SPANISH_SCRIPTURE_VERSION;
        content.quotation = text(content.quotation).replace(/^["“]+|["”]+$/g, "");
        scriptures.push({ english, reference: `${text(content.reference)} (${SPANISH_SCRIPTURE_VERSION})`, quotation: text(content.quotation) });
      }
      return { ...section, title: pick(`${key}.title`, section.title) ?? "", content };
    });
    return { teaching: newTeaching, categories: newCategories, sections: newSections, scriptures };
  };

  return { groups, apply };
}

// Common tú forms that have a different voseo form. Seeing one in prose usually means the voseo slipped.
const TU_FORMS = /\b(tienes|puedes|eres|quieres|sabes|necesitas|debes|vienes|haces|dices|vives|sientes|piensas|buscas|crees|llevas|acércate|quédate|mírate|levántate|entrégate|vuélvete|mantente|arrepiéntate|abre tu|cierra tu|ten fe)\b/i;
const VOSOTROS = /\b(vosotros|vosotras|os\s|habéis|tenéis|podéis|sois)\b/i;

const paragraphCount = (value: string) => value.split("\n").filter((line) => line.trim()).length;
// Wording the translation rules ask to avoid outside Scripture.
const RULE_CHECKS: { pattern: RegExp; message: string; /** The check is skipped when the English says this, for example when the English itself gives the teacher's gender. */ unlessSource?: RegExp }[] = [
  { pattern: /\b(la maestra|el maestro|la docente|el docente)\b/i, message: "names the teacher's gender although the English gives none", unlessSource: /\b(she|he|her|his|him|herself|himself)\b/i },
  { pattern: /\binquietud\b/i, message: "uses “inquietud” (use impulso or dirección for a prompting)" },
  { pattern: /\bcongregaci[oó]n\b/i, message: "uses “congregación” (use el grupo or los participantes)" },
  { pattern: /\b[Ll]a Comuni[oó]n\b/, message: "calls the Lord's Supper “la Comunión” (use la Santa Cena)" },
  { pattern: /\buna (ama|agua|alma|área|águila|arma|hambre)\b/i, message: "uses “una” before a stressed a- (use un ama, un alma…)" },
];

const countOf = (value: string, pattern: RegExp) => (value.match(pattern) ?? []).length;
const urls = (value: string) => [...value.matchAll(/\]\(([^\s)]+)\)/g)].map((match) => match[1]).sort().join("|");

/** Checks one translated segment against its English original. Problems that would break the page are errors; the rest are warnings for review. */
export function checkSegment(source: TranslationSegment, translated: string | undefined): { error?: string; warnings: string[] } {
  const label = source.text.length > 60 ? `${source.text.slice(0, 57)}…` : source.text;
  if (!translated || !translated.trim()) return { error: `No translation came back for “${label}”.`, warnings: [] };
  const warnings: string[] = [];
  if (urls(source.text) !== urls(translated)) return { error: `A link changed in “${label}”.`, warnings };
  if (countOf(source.text, /\*\*/g) !== countOf(translated, /\*\*/g)) warnings.push(`Bold formatting may have shifted in “${label}”.`);
  if (source.kind === "text" && paragraphCount(source.text) !== paragraphCount(translated)) warnings.push(`The paragraph count changed in “${label}”.`);
  if (source.kind !== "scripture_verse") {
    const tu = translated.match(TU_FORMS);
    if (tu) warnings.push(`Possible tú form “${tu[0]}” instead of vos in “${label}”.`);
    const vosotros = translated.match(VOSOTROS);
    if (vosotros) warnings.push(`Possible vosotros form “${vosotros[0].trim()}” in “${label}”.`);
    for (const check of RULE_CHECKS) if (check.pattern.test(translated) && !(check.unlessSource && check.unlessSource.test(source.text))) warnings.push(`“${label}” ${check.message}.`);
  }
  if (source.limit && translated.length > source.limit) {
    return { error: `${fieldLabel(source.id)} is ${translated.length} characters in Spanish, over the website's ${source.limit}-character limit. Nothing was saved and nothing was cut. Raise the limit, or shorten the English teaching, then convert again.`, warnings };
  }
  return { warnings };
}

type GroupResult = { texts: Map<string, string> };

async function callClaude(group: TranslationSegment[], options: Required<Pick<AutoTranslateOptions, "apiKey" | "model">> & { fetchImpl: typeof fetch }): Promise<GroupResult> {
  const response = await options.fetchImpl(API_URL, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": options.apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: options.model,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: translationSystemPrompt(),
      tools: [SAVE_TOOL],
      // Current models (Claude Opus 5.5 and later) reject a forced tool call with a 400, so the model chooses ("auto") and the
      // prompt names the tool. If it answers without calling the tool, that is caught below as an unexpected answer and retried.
      tool_choice: { type: "auto" },
      messages: [{ role: "user", content: `Translate these segments. Return every id. Call the ${SAVE_TOOL.name} tool with the result; do not answer in plain text.\n\n${JSON.stringify({ segments: group.map((segment) => ({ id: segment.id, kind: segment.kind, text: segment.text, ...(segment.note ? { note: segment.note } : {}) })) }, null, 2)}` }],
    }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload?.error?.message ? String(payload.error.message) : `HTTP ${response.status}`;
    throw Object.assign(new Error(`The translation service returned an error: ${message}`), { retryable: response.status === 429 || response.status >= 500 });
  }
  if (payload?.stop_reason === "max_tokens") throw Object.assign(new Error("The translation was cut off because this part of the teaching is very long."), { retryable: false });
  const block = (payload?.content ?? []).find((item: { type?: string; name?: string }) => item.type === "tool_use" && item.name === SAVE_TOOL.name);
  const segments = block?.input?.segments;
  if (!Array.isArray(segments)) throw Object.assign(new Error("The translation service returned an unexpected answer."), { retryable: true });
  const texts = new Map<string, string>();
  for (const item of segments) {
    if (!item || typeof item.id !== "string" || typeof item.text !== "string") continue;
    texts.set(item.id, item.text.replace(/\r\n?/g, "\n").trim());
  }
  return { texts };
}

async function translateGroup(group: TranslationSegment[], options: Parameters<typeof callClaude>[1]): Promise<GroupResult> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const result = await callClaude(group, options);
      const missing = group.filter((segment) => !result.texts.get(segment.id));
      if (!missing.length) return result;
      lastError = new Error(`${missing.length} part${missing.length === 1 ? "" : "s"} of the teaching did not come back translated.`);
    } catch (error) {
      lastError = error;
      if ((error as { retryable?: boolean }).retryable === false) break;
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  throw lastError instanceof Error ? lastError : new Error("The translation failed.");
}

/** Translates a teaching. Throws with a readable message if any part cannot be translated; nothing is saved here. */
export async function translateTeaching(
  teaching: ExportTeaching,
  categories: ExportCategory[],
  sections: ExportSection[],
  options: AutoTranslateOptions,
): Promise<AutoTranslateResult> {
  const { groups, apply } = collectSegments(teaching, categories, sections);
  const { translated, warnings } = await translateSegments(groups, options);
  return { ...apply(translated), warnings };
}

/**
 * Translates groups of segments (one request per group, several at a time) and checks every answer against its
 * English original. Anything that cannot be translated, or comes back over its limit, throws with a readable
 * message; nothing is shortened and nothing is saved here. Used for teachings and for handouts.
 */
export async function translateSegments(
  groups: TranslationSegment[][],
  options: AutoTranslateOptions,
): Promise<{ translated: Map<string, string>; warnings: string[] }> {
  const settings = {
    apiKey: options.apiKey,
    model: options.model || DEFAULT_TRANSLATION_MODEL,
    fetchImpl: options.fetchImpl ?? fetch,
  };
  const results: GroupResult[] = new Array(groups.length);
  let next = 0;
  const worker = async () => {
    while (next < groups.length) {
      const index = next++;
      results[index] = await translateGroup(groups[index], settings);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(options.concurrency ?? 4, groups.length)) }, worker));

  const translated = new Map<string, string>();
  const warnings: string[] = [];
  const errors: string[] = [];
  groups.forEach((group, index) => {
    for (const segment of group) {
      const value = results[index].texts.get(segment.id);
      const check = checkSegment(segment, value);
      if (check.error) errors.push(check.error);
      warnings.push(...check.warnings);
      if (value) translated.set(segment.id, value);
    }
  });
  if (errors.length) throw new Error(errors.slice(0, 5).join(" "));
  return { translated, warnings };
}
