#!/usr/bin/env node

// Sets the two Español (El Salvador) copyright footers for the only two Spanish
// Bible versions the site quotes: Reina-Valera 1960 (RVR1960) and Nueva Versión
// Internacional (NVI).
//
// Wording rules (researched from each publisher's own published terms):
//  - The site does NOT hold individual written permission from either publisher.
//    It quotes within their published standing limits (500 verses, under 25% of
//    the work, never a whole book, acknowledgment given). So the notices say the
//    quotes are used under each publisher's published usage norms, and do not
//    say "usado con permiso".
//  - RVR1960: copyright lines and the trademark line are the American Bible
//    Society's published wording. NVI: Biblica's current acknowledgment
//    (1999, 2015, 2022), latest edition only.
//  - Register: formal, impersonal Salvadoran Spanish (no "vosotros"; no voseo in
//    legal text).
//
// The long footer renders on /espanol/derechos-de-autor; the short footer prints
// on Español teachings and goes in Spanish emails ("aquí" becomes the page URL).
//
// Dry run:  node --env-file=.env.local scripts/set-spanish-copyright-footers.mjs
// Apply:    APPLY=true BACKUP_DIR=<folder> node --env-file=.env.local scripts/set-spanish-copyright-footers.mjs

import { mkdirSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const LONG_ID = "7eb2fa03-d789-4396-b30f-e0c68f5f28ee";
const SHORT_ID = "08692da6-d826-47cb-a497-34ad90e11a71";

const LONG = `Las citas bíblicas de este sitio se usan conforme a las normas de uso que publica cada editor. Las versiones citadas son la Reina-Valera 1960 (RVR1960) y la Nueva Versión Internacional (NVI).

Las citas bíblicas marcadas (RVR1960) fueron tomadas de la versión Reina-Valera © 1960 Sociedades Bíblicas en América Latina; © renovado 1988 Sociedades Bíblicas Unidas. Se citan conforme a las [normas de uso publicadas por la Sociedad Bíblica Americana](https://www.americanbible.org/rights-and-permissions/).

Reina-Valera 1960® es una marca registrada de Sociedades Bíblicas Unidas, y se puede usar solamente bajo licencia.

Las citas bíblicas marcadas (NVI) fueron tomadas de la Santa Biblia, Nueva Versión Internacional® NVI® © 1999, 2015, 2022 por [Biblica, Inc.](https://www.biblica.com)® Se citan conforme a las [normas de uso publicadas por Biblica](https://www.biblica.com/permissions/). Reservados todos los derechos en todo el mundo.

El comentario original, la organización, el contenido editorial y la presentación © 2026 The Prayer Whiteboard. Todos los derechos reservados. Las citas bíblicas y cualquier material de enseñanza de terceros siguen siendo propiedad de sus respectivos titulares de derechos de autor.`;

const SHORT = `Las citas bíblicas son de la Reina-Valera 1960 (RVR1960) y de la Nueva Versión Internacional (NVI). Los reconocimientos de derechos de autor completos se pueden ver aquí.

RVR1960: Reina-Valera © 1960 Sociedades Bíblicas en América Latina; © renovado 1988 Sociedades Bíblicas Unidas. Reina-Valera 1960® es una marca registrada de Sociedades Bíblicas Unidas, y se puede usar solamente bajo licencia.

NVI: Santa Biblia, Nueva Versión Internacional® NVI® © 1999, 2015, 2022 por Biblica, Inc.® Reservados todos los derechos en todo el mundo.

Contenido original © 2026 The Prayer Whiteboard. Todos los derechos reservados.`;

const APPLY = process.env.APPLY === "true";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are required.");
const supabase = createClient(url, key);

const { data: rows, error } = await supabase.from("content_footers").select("id, internal_title, content, updated_at").in("id", [LONG_ID, SHORT_ID]);
if (error || rows?.length !== 2) throw new Error(`Could not read both footers: ${error?.message ?? `found ${rows?.length}`}`);

const next = { [LONG_ID]: LONG, [SHORT_ID]: SHORT };
for (const row of rows) console.log(`== ${row.internal_title}\n--- before:\n${row.content}\n--- after:\n${next[row.id]}\n`);

if (!APPLY) {
  console.log("Dry run only. Re-run with APPLY=true to write these (the old text is saved first).");
  process.exit(0);
}

const dir = process.env.BACKUP_DIR ?? ".";
mkdirSync(dir, { recursive: true });
const backup = `${dir}/spanish-footers-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
writeFileSync(backup, JSON.stringify(rows.map(({ id, internal_title, content }) => ({ id, internal_title, content })), null, 2));
console.log(`Backup saved to ${backup}`);

for (const row of rows) {
  const { data, error: updateError } = await supabase.from("content_footers").update({ content: next[row.id] }).eq("id", row.id).eq("updated_at", row.updated_at).select("id");
  console.log(updateError ? `ERROR ${row.internal_title}: ${updateError.message}` : data?.length ? `updated ${row.internal_title}` : `SKIPPED (edited since read) ${row.internal_title}`);
}
