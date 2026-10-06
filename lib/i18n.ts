// Interface text for the public teaching and devotional pages. Español content (a teaching or
// devotional whose language is "es") renders entirely from the "es" column; English content
// renders from "en", which holds the same wording the pages used before Español existed.

export type Language = "en" | "es";

export function toLanguage(value: unknown): Language {
  return value === "es" ? "es" : "en";
}

const text = {
  en: {
    homePath: "/",
    backToHome: "Back to home",
    printToPdf: "Print to PDF",
    brandEyebrow: "The Prayer Whiteboard",
    deepDive: "Deep Dive",
    deepDivesCollection: "Deep Dives Collection",
    deepDivesPath: "/deep-dives",
    viewChalkboardLarger: "View chalkboard larger",
    downloadChalkboard: "Download Chalkboard",
    chalkboardSuffix: "chalkboard",
    teachingFallbackTitle: "Teaching",
    devotionalFallbackTitle: "Devotional",
    sevenDayDevotional: "7-Day Devotional",
    dayOfSeven: (day: number) => `Day ${day} of 7`,
    dayFallback: (day: number) => `Day ${day}`,
    readDay: (day: number) => `Read Day ${day}`,
    anchorScriptures: "Anchor Scriptures",
    devotionalReading: "Devotional Reading",
    confession: "Today's Confession",
    journalPrompt: "5-Minute Journal Prompt",
    prayerActivation: "Prayer Activation Exercise",
    previousDay: "Previous day",
    nextDay: "Next day",
    devotionalOverview: "Devotional overview",
    returnToOverview: "Return to devotional overview",
    returnToTeaching: "Return to full teaching",
    openDevotionalOnline: "Prefer to read online? Open the devotional",
    startDayOneOnline: "Prefer to read online? Start with day one",
    emailCtaCopy: "Want to receive new teachings and other content from The Prayer Whiteboard? Choose the emails you would like to receive.",
    dateLocale: "en-US",
  },
  es: {
    homePath: "/espanol",
    backToHome: "Volver al inicio",
    printToPdf: "Imprimir o guardar como PDF",
    brandEyebrow: "The Prayer Whiteboard",
    deepDive: "Estudio profundo",
    deepDivesCollection: "Colección de estudios profundos",
    deepDivesPath: "/espanol#profundo",
    viewChalkboardLarger: "Ver la pizarra más grande",
    downloadChalkboard: "Descargar la pizarra",
    chalkboardSuffix: "pizarra",
    teachingFallbackTitle: "Enseñanza",
    devotionalFallbackTitle: "Devocional",
    sevenDayDevotional: "Devocional de 7 días",
    dayOfSeven: (day: number) => `Día ${day} de 7`,
    dayFallback: (day: number) => `Día ${day}`,
    readDay: (day: number) => `Leer el Día ${day}`,
    anchorScriptures: "Pasajes bíblicos clave",
    devotionalReading: "Lectura devocional",
    confession: "Confesión de hoy",
    journalPrompt: "Pregunta para tu diario de 5 minutos",
    prayerActivation: "Ejercicio de activación en oración",
    previousDay: "Día anterior",
    nextDay: "Día siguiente",
    devotionalOverview: "Resumen del devocional",
    returnToOverview: "Volver al resumen del devocional",
    returnToTeaching: "Volver a la enseñanza completa",
    openDevotionalOnline: "¿Prefieres leer en línea? Abre el devocional",
    startDayOneOnline: "¿Prefieres leer en línea? Empieza con el día uno",
    emailCtaCopy: "",
    dateLocale: "es",
  },
} as const;

export function ui(language: Language) {
  return text[language];
}

export function formatLongDate(value: string, language: Language) {
  return new Intl.DateTimeFormat(ui(language).dateLocale, { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}
