// "Spanish Translation Rules — The Prayer Whiteboard", written as instructions for whoever translates an exported
// file by hand (a person or another AI). The exported teaching, devotional and weekly update files all carry these,
// so every Español item is translated the same way as "Convert & Save Spanish Version" (lib/teaching-auto-translate.ts).

export const SPANISH_TRANSLATION_RULES = [
  "Use Español de El Salvador, with natural, warm, professional wording.",
  "Addressing one person: use vos (voseo) and its conjugations, including imperatives and subjunctives: vos tenés, podés, elegí, suscribite, acercate, mirá, orá, que querás, que confirmés. Keep tu / tus and te where grammatically appropriate. Never use tú forms (tienes, puedes, acércate).",
  "Addressing more than one person: use ustedes, never vosotros. Keep whether a prophetic word speaks to one person or to the whole group.",
  "Prayers addressed to God use vos: Señor, ungí mis ojos; Padre, ensanchá nuestro corazón; Enseñanos; Hacenos atentos.",
  "Preserve the meaning, theological intent, tone and degree of certainty. Do not add doctrine, strengthen or soften claims, or embellish prophetic words. Translate everything in full: do not shorten or summarize, and add no notes. Never shorten or truncate to fit a field limit: if a faithful translation is too long, the upload stops with an error naming the field, its length and the limit, and the limit is raised or the English is edited, never the translation.",
  "The teacher: follow the English. When it says he or she about the teacher, keep that gender (él / ella, el maestro / la maestra, el docente / la docente) and agree the articles and adjectives. When it says only \"the teacher\" and gives no gender, do not add one: use \"En la enseñanza se explicó…\" or a similar natural construction. Never guess a gender.",
  "The small prayer group: el grupo or los participantes, not congregación. A spiritual prompting: impulso or dirección, according to context; avoid inquietud when it would suggest worry.",
  "Communion with the bread and the cup: la Santa Cena. Spiritual fellowship: comunión (comunión con Dios). Holy Spirit: el Espíritu Santo, with the article. Feminine nouns with a stressed a- take el / un: un ama de casa, el agua.",
  "Capitalize pronouns and possessives that refer to God (the Father, Jesus or the Holy Spirit) throughout, as a reverential convention: Él, Su, Sus, Tú, Tu, Tus, Te, Lo, Le, Vos, Mí, Mi, Yo. Pronouns attached to a verb (alabarlo, seguirle) stay lowercase; where natural, name God instead (alabar a Dios). Keep published Bible quotations in their original lowercase.",
  "Match the English word choice and watch for Spanish fixed expressions that change the meaning. Translate deliverance as liberación and salvation as salvación. When believers take the word (a Scripture or a word from the Holy Spirit), write tomar una palabra de Dios, never tomar la palabra, which means \"to begin speaking.\"",
  "Write Spanish headings and titles in sentence case: capitalize only the first word, proper names, and divine names and titles (Dios, Señor, Jesús, Cristo, Espíritu Santo, Rey de reyes), as in \"Palabra profética para el grupo\" and \"Mantené tus ojos en Jesús\". Do not copy English title case; headings are published exactly as written. English importer labels stay exactly as they are.",
  "Scripture: keep every reference and translate only the book name (2 Corintios 3:16-18). Replace each quoted verse with the published RVR1960 or NVI text of the same passage, exactly as printed, and name that version. Never translate the English verse yourself and label it NVI or RVR1960. Do not change Bible quotations to voseo.",
  "Keep the file's structure, styles, bold, italic and links exactly, and keep any English importer labels the uploader needs.",
] as const;

/** The rules as numbered lines, for the instructions inside an exported file. */
export function spanishTranslationRuleLines(): string[] {
  return SPANISH_TRANSLATION_RULES.map((rule, index) => `Rule ${index + 1}: ${rule}`);
}
