# Handout templates

`handout-es.docx` and `handout-en.docx` are finished handouts used as templates by **Build the handout** (`/api/admin/handout/build`,
`lib/handout-docx/`). The builder replaces only the text inside the three section boxes, the whiteboard caption box, the footer box
and the whiteboard picture. Every text box, picture and shape keeps the position and size it has in the file.

- `handout-es.docx` is the finished Español handout (`20261010_es_handout.docx`), as it is.
- `handout-en.docx` is the same file with the English "Deepen your study" lines, the English QR code and the English footer text.
- `handout-*.json` says which section goes in which box (`sectionOrder`, in the order the boxes are written in the file) and how much
  text each box holds (`capacityPt`), measured on the finished Español handout.

To change a template, edit it in Word, save it here under the same name, and measure the boxes again:

```
node scripts/make-handout-templates.mjs <es-finished.docx> <en-finished.docx> <en-draft-text.docx> assets/handout-templates
```

(The Español file is copied as is; the English file is generated from it.) The room left under the text on the printed page (`SLACK_PT`
in that script) was read from a picture of the printed page; adjust it if a section's box changes.

Text is measured with the Calibri and Georgia letter widths in `lib/handout-docx/font-metrics.json`, which is why the builder can say
whether a section fits before the file is opened. It is an estimate: check a new build in Word.
