// Spanish Bible book names -> English names. BibleGateway looks passages up by
// English book name for every version, so Spanish references are translated
// to English for lookups.
export const SPANISH_BOOKS_TO_ENGLISH = {
  "génesis": "Genesis", "éxodo": "Exodus", "levítico": "Leviticus", "números": "Numbers", deuteronomio: "Deuteronomy",
  "josué": "Joshua", jueces: "Judges", rut: "Ruth", "1 samuel": "1 Samuel", "2 samuel": "2 Samuel", "1 reyes": "1 Kings",
  "2 reyes": "2 Kings", "1 crónicas": "1 Chronicles", "2 crónicas": "2 Chronicles", esdras: "Ezra", "nehemías": "Nehemiah",
  ester: "Esther", job: "Job", salmo: "Psalm", salmos: "Psalm", proverbios: "Proverbs", "eclesiastés": "Ecclesiastes",
  cantares: "Song of Solomon", "isaías": "Isaiah", "jeremías": "Jeremiah", lamentaciones: "Lamentations", ezequiel: "Ezekiel",
  daniel: "Daniel", oseas: "Hosea", joel: "Joel", "amós": "Amos", "abdías": "Obadiah", "jonás": "Jonah", miqueas: "Micah",
  "nahúm": "Nahum", habacuc: "Habakkuk", "sofonías": "Zephaniah", hageo: "Haggai", "zacarías": "Zechariah", "malaquías": "Malachi",
  mateo: "Matthew", marcos: "Mark", lucas: "Luke", juan: "John", hechos: "Acts", romanos: "Romans", "1 corintios": "1 Corinthians",
  "2 corintios": "2 Corinthians", "gálatas": "Galatians", efesios: "Ephesians", filipenses: "Philippians", colosenses: "Colossians",
  "1 tesalonicenses": "1 Thessalonians", "2 tesalonicenses": "2 Thessalonians", "1 timoteo": "1 Timothy", "2 timoteo": "2 Timothy",
  tito: "Titus", "filemón": "Philemon", hebreos: "Hebrews", santiago: "James", "1 pedro": "1 Peter", "2 pedro": "2 Peter",
  "1 juan": "1 John", "2 juan": "2 John", "3 juan": "3 John", judas: "Jude", apocalipsis: "Revelation",
};

export function bookNameOf(reference) {
  return reference.match(/^(.+?)\s\d+:\d+/)?.[1]?.toLowerCase();
}

// Returns the reference with an English book name, or null if the book is unknown.
export function spanishToEnglishReference(reference) {
  const english = SPANISH_BOOKS_TO_ENGLISH[bookNameOf(reference) ?? ""];
  return english ? reference.replace(/^(.+?)(\s\d+:\d+)/, `${english}$2`) : null;
}
