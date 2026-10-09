import assert from "node:assert/strict";
import test from "node:test";
import { buildEditableFields } from "../lib/teaching-revisions.ts";

const teaching = { id: "t1", title: "T", central_theme: null, introduction: null, summary: null, teaser_1_heading: null, teaser_1_text: null, teaser_2_heading: null, teaser_2_text: null };
const categories = [{ id: "c1", title: "Faithful", sort_order: 1 }];
const section = (content) => [{ id: "s1", category_id: "c1", title: "Psalm", sort_order: 1, content }];

test("a reviewer can see which Bible version a scripture uses", () => {
  const fields = buildEditableFields(teaching, categories, section({ format: "scripture", reference: "Psalm 23:1", translation: "KJV", quotation: "The Lord is my shepherd." }));
  const reference = fields.find((field) => field.fieldKey === "reference");
  const quotation = fields.find((field) => field.fieldKey === "quotation");
  assert.equal(reference.label, "Scripture reference (KJV)");
  assert.equal(quotation.label, "Scripture quotation (KJV)");
  assert.equal(quotation.context, "Faithful › Psalm (Scripture · KJV)");
  assert.equal(reference.context, quotation.context);
});

test("the version is shown for reference only, never as an editable field", () => {
  const fields = buildEditableFields(teaching, categories, section({ format: "scripture", reference: "John 3:16", translation: "ESV", quotation: "For God so loved the world." }));
  assert.equal(fields.some((field) => field.fieldKey === "translation"), false);
});

test("a scripture with no version recorded falls back to the plain labels", () => {
  const fields = buildEditableFields(teaching, categories, section({ format: "scripture", reference: "John 3:16", quotation: "For God so loved." }));
  assert.equal(fields.find((field) => field.fieldKey === "quotation").label, "Scripture quotation");
  assert.equal(fields.find((field) => field.fieldKey === "quotation").context, "Faithful › Psalm (Scripture)");
});

test("other section formats are labelled as before", () => {
  const fields = buildEditableFields(teaching, categories, section({ format: "paragraph", text: "Hello." }));
  assert.equal(fields.find((field) => field.fieldKey === "text").context, "Faithful › Psalm (Paragraph)");
});
