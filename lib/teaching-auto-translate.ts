// "Convert & Save Spanish Version": translates an English teaching into Español (El Salvador, voseo) with
// the Claude API and hands the result to the same Word exporter and importer that a hand translation goes
// through, so the new draft is stored, validated and displayed exactly like an imported Spanish teaching.
//
// Only text is sent: the title, Central Theme, Introduction, Short Summary, homepage teasers, category and
// section titles, and section text. Labels, ids, formats and links never leave as something to translate,
// so the structure cannot change. Scripture quotations come back as the Reina-Valera 1960 text for the
// passage and are listed for a person to check before publishing.

import type { ExportCategory, ExportSection, ExportTeaching } from "./teaching-docx-export.ts";

export type TeacherGender = "woman" | "man" | "unknown";

export type TranslationSegmentKind = "heading" | "text" | "scripture_reference" | "scripture_verse";
export type TranslationSegment = { id: string; kind: TranslationSegmentKind; text: string; note?: string };

export type AutoTranslateOptions = {
  apiKey: string;
  model?: string;
  teacher?: TeacherGender;
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

const TEACHER_LINE: Record<TeacherGender, string> = {
  woman: 'The person who taught is a woman: call her "la maestra" and use feminine agreement for her.',
  man: 'The person who taught is a man: call him "el maestro" and use masculine agreement for him.',
  unknown: 'The teacher\'s gender is not given. Follow the English pronouns when there are any ("she" → "la maestra", "he" → "el maestro"); otherwise use neutral wording such as "la enseñanza explicó" or "quien enseñó". Never use "el docente".',
};

export function translationSystemPrompt(teacher: TeacherGender = "unknown") {
  return `You are a professional theological translator for The Prayer Whiteboard, a prayer ministry website. You translate teachings from English into Spanish as spoken in El Salvador (Español de El Salvador), for Salvadoran readers in evangelical and Spirit-filled churches.

PRONOUNS AND VERBS
- Singular "you" is always vos with Salvadoran voseo forms: vos sos, tenés, podés, querés, sabés, llevás, mirá, orá, acercate, quedate, tomá, hacé, decí, vení, tené, prestá atención. Present subjunctive in the voseo style: "que notés", "que vengás". Object and possessive forms stay te / tu / tus. Never use tú forms (tienes, puedes, acércate, mira as a command).
- Plural "you" is always ustedes (vengan, quédense, manténganse). Never vosotros.
- Prayers addressed to God use vos: "Señor, ungí mis ojos", "Padre, ensanchá nuestro corazón", "Enseñanos", "Hacenos", "Mantenenos".
- Words of prophecy spoken by God to the group use ustedes for the group and capitalized pronouns for God ("Ustedes son Mis tesoros", "Quédense cerca de Mí").

CAPITALIZATION FOR GOD
- Capitalize pronouns and possessives that refer to God the Father, Jesus or the Holy Spirit: Él, Su, Sus, Tu, Tus, Vos, Mí, Mi, Mis, Yo, Sí mismo. Leave object pronouns lowercase (lo, le, te, nos).
- Do not capitalize pronouns that refer to people.

HEADINGS (segments of kind "heading")
- Use the site's title case: capitalize every main word, including verbs, nouns, adjectives, adverbs, possessives and "No"; keep articles, prepositions and conjunctions lowercase unless they are the first word (el, la, los, las, un, una, de, del, a, al, en, con, por, para, sin, y, o, que, lo, se).
- Examples from the live site: "Palabra Profética para el Grupo", "Mantené Tus Ojos en Jesús", "Jesús Es Nuestro Modelo", "Mirá Más Allá de lo Temporal", "Prácticas que Vuelven el Corazón hacia la Luz", "Oración Final".
- All other text uses normal Spanish sentence case.

WORDING
- Holy Spirit → el Espíritu Santo (always with the article). Communion and the Lord's Supper → la Santa Cena (never "la Comunión", because "comunión" is kept for fellowship: comunión con Dios).
- gathering → la reunión; believers → los creyentes; Scripture → las Escrituras; a prompting of the Holy Spirit → una inquietud del Espíritu Santo; chalkboard → la pizarra; doing the dishes → lavar los trastes.
- Bible books use their Spanish names (Génesis, Isaías, Hageo, Santiago, 1 Corintios, 1 Juan, Apocalipsis). When an English sentence spells out an ordinal ("First Corinthians 6:17 says"), write "Primera de Corintios 6:17 dice".
- Keep people's names and places as they are (Oklahoma City, Kenneth Copeland).
- ${TEACHER_LINE[teacher]}

FORMATTING
- Keep **bold**, *italic* and [link text](https://address) markup exactly where it is: translate the words inside, keep every address unchanged, and keep the same number of ** and * markers.
- Keep line breaks: a segment with N lines comes back with N lines, in the same order.
- Use curly double quotes “ ” for quotations and single quotes ' ' for a quotation inside a quotation. Use ¿ ? and ¡ ! correctly.
- Translate everything; add nothing (no notes, explanations or bracketed comments) and leave nothing out.

SCRIPTURE
- "scripture_reference" segments: translate only the book name. "2 Corinthians 3:16-18" → "2 Corintios 3:16-18". Do not add a version.
- "scripture_verse" segments: do not translate the English. Write the passage exactly as it reads in the Reina-Valera 1960 (RVR1960) for the reference given in the segment's note. No voseo inside Scripture; keep the Bible's own wording. Do not add quotation marks around the whole passage.

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

type Collected = {
  groups: TranslationSegment[][];
  apply: (translated: Map<string, string>) => { teaching: ExportTeaching; categories: ExportCategory[]; sections: ExportSection[]; scriptures: ScriptureToCheck[] };
};

/** Splits a teaching into translatable text segments: one group for the teaching's own fields, then one group per category. */
export function collectSegments(teaching: ExportTeaching, categories: ExportCategory[], sections: ExportSection[]): Collected {
  const header: TranslationSegment[] = [];
  const add = (group: TranslationSegment[], id: string, kind: TranslationSegmentKind, value: unknown, note?: string) => {
    const t = text(value);
    if (t) group.push(note ? { id, kind, text: t, note } : { id, kind, text: t });
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
  }
  return { warnings };
}

async function callClaude(group: TranslationSegment[], options: Required<Pick<AutoTranslateOptions, "apiKey" | "model" | "teacher">> & { fetchImpl: typeof fetch }) {
  const response = await options.fetchImpl(API_URL, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": options.apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: options.model,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: translationSystemPrompt(options.teacher),
      tools: [SAVE_TOOL],
      tool_choice: { type: "tool", name: SAVE_TOOL.name },
      messages: [{ role: "user", content: `Translate these segments. Return every id.\n\n${JSON.stringify({ segments: group }, null, 2)}` }],
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
  const map = new Map<string, string>();
  for (const item of segments) if (item && typeof item.id === "string" && typeof item.text === "string") map.set(item.id, item.text.replace(/\r\n?/g, "\n").trim());
  return map;
}

async function translateGroup(group: TranslationSegment[], options: Parameters<typeof callClaude>[1]) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const map = await callClaude(group, options);
      const missing = group.filter((segment) => !map.get(segment.id));
      if (!missing.length) return map;
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
  const settings = {
    apiKey: options.apiKey,
    model: options.model || DEFAULT_TRANSLATION_MODEL,
    teacher: options.teacher ?? "unknown",
    fetchImpl: options.fetchImpl ?? fetch,
  };
  const { groups, apply } = collectSegments(teaching, categories, sections);

  const results: Map<string, string>[] = new Array(groups.length);
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
      const value = results[index].get(segment.id);
      const check = checkSegment(segment, value);
      if (check.error) errors.push(check.error);
      warnings.push(...check.warnings);
      if (value) translated.set(segment.id, value);
    }
  });
  if (errors.length) throw new Error(errors.slice(0, 5).join(" "));

  return { ...apply(translated), warnings };
}
