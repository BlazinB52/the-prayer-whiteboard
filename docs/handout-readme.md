# How to Build a New Handout

The weekly steps for turning a Saturday teaching into the printed, folded handout, in English and Español.

---

## What you need before you start

- [ ] **The full teaching** for the week (Word file).
- [ ] **The whiteboard picture** for the cover (portrait, 3:4 shape, like 1080 × 1440).
- [ ] **handout-template.docx**: the style template the condensed text goes into. It is kept with this guide; you don't make a new one each week.
- [ ] **The condensing prompt** in Step 1 below.

**Check the whiteboard before you use it.** Look for misspellings (one past board said "MESSANIC" for "Messianic") and any logo or watermark in the corners, such as the Gemini sparkle in the bottom-right corner. Fix or crop these first, because the picture prints on the front cover.

---

## How the handout is laid out

One landscape Letter sheet, printed on both sides and folded in half.

| Page | Left half | Right half |
|---|---|---|
| **Page 1 (outside)** | **Back left:** the take-home daily rhythm, then the QR code and footer | **Front cover:** the whiteboard picture, with a one-sentence caption under it |
| **Page 2 (inside)** | **Inside left:** the message | **Inside right:** the response |

The text boxes are a **fixed size**. If text is too long, the builder stops and tells you which box is over and by how much. It never cuts words off.

---

## Step 1: Condense the teaching (done by an agent)

1. Open a new chat with Claude (or your agent).
2. Attach **the full teaching** and **handout-template.docx**.
3. Paste in the **prompt** below.
4. You get back:
   - a Word file named like `20261017_en_handout.docx`
   - a **whiteboard caption** (one sentence, for the cover)
   - **character counts** for each section
5. Read it over. Make sure nothing important was left out, and that "Holy Spirit" stayed without "the" wherever the teaching wrote it that way.

### Length limits (English)

| Section | Aim for | Never exceed |
|---|---|---|
| 1. Inside left | 1,450–1,550 | 1,650 |
| 2. Inside right | 1,450–1,550 | 1,650 |
| 3. Back left | 1,200–1,300 | 1,400 |

These caps are set so the **Spanish** version, which runs 10–15% longer, still fits the same boxes. They come from the Oct 10, 2026 handout, the longest draft whose Spanish version fit. If the builder ever reports a box as over, its numbers are the real limits, so update these.

### The prompt to copy

> Copy everything inside the box below.

````text
You are condensing a Prayer Whiteboard teaching into the draft text for a printed, folded handout. Attached are the full teaching and the handout template (handout-template.docx). Your output is a Word file built on that template, which will be uploaded to the website and placed automatically into the handout's fixed text boxes.

## The three sections
The handout has exactly three sections, in this order. Each one starts with a Heading 1.

1. **Inside left: the message.** What God is saying in the teaching: the foundation, key Scriptures, and main truths from the first part of the teaching.
2. **Inside right: the response.** What it means for daily life and prayer: application, intercession, and how to walk it out, drawn from the later part of the teaching.
3. **Back left: the take-home.** A daily rhythm or pattern the reader can keep using all week: short, practical, memorable.

## Styles: use only these
Use the template's styles exactly. Do not type bullet characters, numbers, or extra blank lines, and do not change fonts or sizes.

| Style | Use |
|---|---|
| **Heading 1** | The section title. ALL CAPS, 2–6 words. One per section. |
| **Subtitle** | Directly under the section title: one short phrase, 4–9 words. Use one on every section. |
| **Normal** | Paragraphs. One opening paragraph under the subtitle (2–3 sentences), and short paragraphs under paragraph titles. Bold and italic are allowed. |
| **Heading 2** | A paragraph title, ALL CAPS, 2–6 words. 3–4 per section. |
| **List Bullet** | Points. Start each with a **bold lead-in** of 2–5 words ending in a period, then one or two sentences. 3–4 bullets per list; at most one list in each section. |
| **Quote** | The optional closing line of a section. For a Scripture line, put the phrase on one Quote line and the reference on a second Quote line, or write them as one line: `Phrase — Book 0:0`. |

**Pattern for each section:** Heading 1 → Subtitle → opening Normal paragraph → 3–4 blocks of (Heading 2 → Normal paragraph *or* List Bullets) → optional Quote closing.

Suggested closings: Section 1 ends with a key verse from the teaching (Quote). Section 2 ends with a verse or a one-line charge (Quote). Section 3 ends with a short rhythm line such as `Stay close • Stay attentive • Stay available • Obey in love` (Quote).

## Length limits: the most important rule
The text boxes are a fixed size, and the Spanish version must fit in the same boxes. Spanish runs 10–15% longer than English, so the English must stay under these counts. Count characters with spaces, including headings, subtitles, and the closing quote.

| Section | Aim for | Never exceed |
|---|---|---|
| 1. Inside left | 1,450–1,550 | 1,650 |
| 2. Inside right | 1,450–1,550 | 1,650 |
| 3. Back left | 1,200–1,300 | 1,400 |

If a section runs long, tighten sentences or cut a bullet. Never shrink the font or remove the subtitle.

## Faithfulness rules
- Use only what the teaching contains. Do not add new ideas, illustrations, stories, or Scripture.
- Keep the teaching's key phrases and any prophetic word close to the original. A prophetic word may be shortened but not reworded.
- **Holy Spirit:** wherever the teaching writes "Holy Spirit" without "the", keep it that way. This is intentional. Where the teaching says "the Holy Spirit", keep "the".
- Scripture: cite only verses the teaching quotes or cites. Put references in parentheses at the end of the sentence, like (2 Corinthians 3:16–18). Use an en dash in verse ranges.
- Capitalize pronouns for God (He, His, Him, Your).
- Tone: warm, clear, encouraging, practical. Use "you" in sections 2 and 3. No hype, no filler, and no em-dash overuse.

## What to return
1. **The Word file**, built from handout-template.docx with all sample text deleted, named `YYYYMMDD_en_handout.docx` using the teaching date (for example, `20261017_en_handout.docx`).
2. **In your reply** (not in the Word file):
   - **Whiteboard caption:** one sentence of 185 characters or fewer that sums up the whole teaching, for under the cover picture.
   - **Character counts** for each section against its limit.
   - Anything you had to leave out that the teacher may want back.

If you cannot create a Word file, return the text with each paragraph's style in brackets at the start, like `[Heading 1] FROM GLORY TO GLORY`, so it can be pasted into the template and styled by hand.
````

---

## Step 2: Create the handout on the website

1. Go to **Admin → Handouts** (`/admin/handouts`) and click **Create new handout**.
2. Fill in:
   - **Publication:** English
   - **Title:** the handout title. This is also its name in the public PDF library.
   - **Version name:** leave it blank unless there are two versions of the same handout (for example, "US" or "Honduras").
   - **Teaching date:** the Saturday of the teaching
   - **Teaching:** pick the matching teaching from the list
3. Click **Save and continue**. This creates the handout as a **draft** and opens its own page.

## Step 3: Upload the draft and build

On the new handout's page (it must still be a **draft**; the build tools are hidden once a handout is published):

1. Under **2. Draft**, upload the Word file from Step 1 (`YYYYMMDD_en_handout.docx`). If the teaching date is empty, the file name fills it in.
2. Upload the **whiteboard picture**.
3. Paste the **whiteboard caption** from Step 1. If you'd rather write it yourself in Word, tick **"Leave the whiteboard caption blank. I will add it in Word."** A yellow placeholder then marks where it goes.
4. Pick the **footer**, then build the handout.
5. If the builder says a box is too long, shorten that section by the amount it reports and build again. Don't shrink the font.
6. Download the built **.docx** and open it in Word.

## Step 4: Check it in Word

- [ ] All three sections fit their boxes, and nothing runs off the page.
- [ ] The cover picture and caption look right.
- [ ] The QR code and footer are correct for the language.
- [ ] Spelling, Scripture references, and capitalized pronouns for God (He, His, Him) are right.
- [ ] "Holy Spirit" matches the teaching (with or without "the").

Then send it to the **Content Managers** to proof.

## Step 5: Publish

1. After proofing, in Word go to **File → Save As → PDF**.
2. On the handout's page, upload the **final PDF** to publish it.
3. Its status changes from **Draft** to **Published** on `/admin/handouts`, and it appears in the public PDF library (**Printable PDF Links**).

To change a published handout's date or draft later, click **Unpublish** first.

---

## Step 6: The Español version

The Spanish handout uses the same layout, with Spanish wording and its own QR code. The builder picks the Spanish template automatically.

1. Open the **published English handout's page** and use its option to translate it into an **Español** handout.
2. Check the translation. It should be Salvadoran Spanish using *vos* (for example *contemplá*, *recibí*, *mantenete*). Spanish uses "el Espíritu Santo."
3. Build, check in Word, proof, and publish the same way as Steps 3–5.
4. Use the **same whiteboard** unless a Spanish one was made.
5. Write the caption in Spanish (185 characters or fewer).
6. If a box is over in Spanish, shorten the Spanish. Don't change the English.

For a second Spanish version for another audience (for example, Honduras), use **Add another version** on the Handouts page, and give it a **Version name**.

---

## Quick checklist

- [ ] Whiteboard checked: spelling and watermark
- [ ] Teaching + template + prompt given to the agent
- [ ] Condensed Word file and caption received; counts within limits
- [ ] **Create new handout** → details → **Save and continue**
- [ ] Draft uploaded, whiteboard uploaded, caption entered → build
- [ ] Checked in Word → sent to Content Managers
- [ ] Final PDF uploaded → **Published**
- [ ] Español version: translate → check → build → proof → publish

---

## File naming

| File | Name |
|---|---|
| English draft | `YYYYMMDD_en_handout.docx` (example: `20261017_en_handout.docx`) |
| Spanish draft | `YYYYMMDD_es_handout.docx` |
| Final PDF | the same name with `.pdf` |

The date is the **teaching** date, not the day you build the handout.
