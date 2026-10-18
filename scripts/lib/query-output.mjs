// The rows from `supabase db query -o json`. The CLI answers in two shapes: a bare array of rows when a person (or Task
// Scheduler) runs it, and an object with the rows under "rows", wrapped in untrusted-data markers, when an AI agent
// does. It can also print a notice after the JSON, so only the first complete JSON value is read.
export function parseQueryRows(raw) {
  const text = String(raw);
  const start = text.search(/[[{]/);
  if (start < 0) throw new Error("the CLI did not return JSON");
  const open = text[start];
  const close = open === "[" ? "]" : "}";
  let depth = 0;
  let inString = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (char === "\\") index += 1;
      else if (char === '"') inString = false;
    } else if (char === '"') {
      inString = true;
    } else if (char === open) {
      depth += 1;
    } else if (char === close && (depth -= 1) === 0) {
      const value = JSON.parse(text.slice(start, index + 1));
      return Array.isArray(value) ? value : (value.rows ?? []);
    }
  }
  throw new Error("the CLI did not return JSON");
}
