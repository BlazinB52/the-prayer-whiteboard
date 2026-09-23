"use client";

import { useId, useRef, useState } from "react";
import { createStoredLink, findStoredLinkAtSelection, normalizeSafeLinkUrl, removeStoredLink, replaceRangeWithStoredLink, toggleStoredBulletLines } from "@/app/formatted-text";

type LinkEditorState = {
  start: number;
  end: number;
  text: string;
  url: string;
  isExisting: boolean;
  error?: string;
};

export function FormattedTextarea({
  label,
  help,
  name,
  value,
  onValueChange,
  rows,
  maxLength,
  bullets = true,
  required = false,
}: {
  label: string;
  help?: string;
  name: string;
  value: string;
  onValueChange: (value: string) => void;
  rows: number;
  maxLength?: number;
  bullets?: boolean;
  required?: boolean;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fieldId = useId();
  const [linkEditor, setLinkEditor] = useState<LinkEditorState | null>(null);

  const restoreSelection = (start: number, end: number) => {
    window.setTimeout(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(start, end);
    }, 0);
  };

  const replaceSelection = (replacement: string, selectionOffset = 0, selectionLength = replacement.length) => {
    const textarea = textareaRef.current;
    const start = textarea?.selectionStart ?? value.length;
    const end = textarea?.selectionEnd ?? value.length;
    const nextValue = `${value.slice(0, start)}${replacement}${value.slice(end)}`;
    onValueChange(nextValue);
    restoreSelection(start + selectionOffset, start + selectionOffset + selectionLength);
  };

  const applyEmphasis = (marker: "*" | "**") => {
    const textarea = textareaRef.current;
    const start = textarea?.selectionStart ?? value.length;
    const end = textarea?.selectionEnd ?? value.length;
    const selectedText = value.slice(start, end);
    const fallbackText = marker === "**" ? "bold text" : "italic text";
    const labelText = selectedText || fallbackText;
    replaceSelection(`${marker}${labelText}${marker}`, marker.length, labelText.length);
  };

  const toggleBullets = () => {
    const textarea = textareaRef.current;
    const start = textarea?.selectionStart ?? value.length;
    const end = textarea?.selectionEnd ?? value.length;
    const next = toggleStoredBulletLines(value, start, end);
    onValueChange(next.value);
    restoreSelection(next.selectionStart, next.selectionEnd);
  };

  const openLinkEditor = () => {
    const textarea = textareaRef.current;
    const selectionStart = textarea?.selectionStart ?? value.length;
    const selectionEnd = textarea?.selectionEnd ?? value.length;
    const existingLink = findStoredLinkAtSelection(value, selectionStart, selectionEnd);

    if (existingLink) {
      setLinkEditor({
        start: existingLink.start,
        end: existingLink.end,
        text: existingLink.text,
        url: existingLink.url,
        isExisting: true,
      });
      return;
    }

    setLinkEditor({
      start: selectionStart,
      end: selectionEnd,
      text: value.slice(selectionStart, selectionEnd),
      url: "",
      isExisting: false,
    });
  };

  const confirmLink = () => {
    if (!linkEditor) return;
    if (!linkEditor.text.trim()) {
      setLinkEditor({ ...linkEditor, error: "Enter the text to display." });
      return;
    }
    if (!normalizeSafeLinkUrl(linkEditor.url)) {
      setLinkEditor({ ...linkEditor, error: "Enter a full web address beginning with http:// or https://." });
      return;
    }

    const nextValue = replaceRangeWithStoredLink(value, linkEditor.start, linkEditor.end, linkEditor.text, linkEditor.url);
    if (!nextValue) {
      setLinkEditor({ ...linkEditor, error: "Enter a valid link." });
      return;
    }

    const inserted = createStoredLink(linkEditor.text, linkEditor.url) ?? "";
    onValueChange(nextValue);
    setLinkEditor(null);
    restoreSelection(linkEditor.start, linkEditor.start + inserted.length);
  };

  const removeLink = () => {
    if (!linkEditor) return;
    const nextValue = removeStoredLink(value, linkEditor.start, linkEditor.end);
    onValueChange(nextValue);
    setLinkEditor(null);
    restoreSelection(linkEditor.start, linkEditor.start + linkEditor.text.length);
  };

  return (
    <div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <label htmlFor={fieldId} className="block text-sm font-bold text-[#385245]">
          {label}
          {help ? <span className="mt-1 block text-xs font-normal text-[#607066]">{help}</span> : null}
        </label>
        <div className="flex flex-wrap gap-1" aria-label={`${label} formatting`}>
          <button type="button" onClick={() => applyEmphasis("**")} className="rounded-lg border border-[#284a3b]/15 bg-white px-3 py-1 text-xs font-black text-[#385245] transition hover:border-[#a85e32]/40 hover:text-[#a85e32]">B</button>
          <button type="button" onClick={() => applyEmphasis("*")} className="rounded-lg border border-[#284a3b]/15 bg-white px-3 py-1 text-xs font-black italic text-[#385245] transition hover:border-[#a85e32]/40 hover:text-[#a85e32]">I</button>
          {bullets ? <button type="button" onClick={toggleBullets} className="rounded-lg border border-[#284a3b]/15 bg-white px-3 py-1 text-xs font-black text-[#385245] transition hover:border-[#a85e32]/40 hover:text-[#a85e32]">Bullets</button> : null}
          <button type="button" onClick={openLinkEditor} className="rounded-lg border border-[#284a3b]/15 bg-white px-3 py-1 text-xs font-black text-[#385245] transition hover:border-[#a85e32]/40 hover:text-[#a85e32]">Link</button>
        </div>
      </div>
      <textarea
        ref={textareaRef}
        id={fieldId}
        name={name}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        rows={rows}
        maxLength={maxLength}
        required={required}
        className="admin-input resize-y py-3"
      />
      {linkEditor ? (
        <div className="mt-3 rounded-xl border border-[#284a3b]/10 bg-[#f7f4ee] p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-bold uppercase tracking-[0.12em] text-[#607066]">Text to display<input value={linkEditor.text} onChange={(event) => setLinkEditor({ ...linkEditor, text: event.target.value, error: undefined })} maxLength={50} className="admin-input normal-case tracking-normal" /><span className="mt-1 block text-xs font-normal normal-case tracking-normal text-[#607066]">{linkEditor.text.length}/50</span></label>
            <label className="block text-xs font-bold uppercase tracking-[0.12em] text-[#607066]">Web address<input value={linkEditor.url} onChange={(event) => setLinkEditor({ ...linkEditor, url: event.target.value, error: undefined })} placeholder="https://example.com" className="admin-input normal-case tracking-normal" /></label>
          </div>
          {linkEditor.error ? <p className="mt-2 text-sm font-bold text-[#a2472c]">{linkEditor.error}</p> : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={confirmLink} className="admin-secondary-button"><span>{linkEditor.isExisting ? "Update link" : "Add link"}</span></button>
            {linkEditor.isExisting ? <button type="button" onClick={removeLink} className="admin-danger-button"><span>Remove link</span></button> : null}
            <button type="button" onClick={() => setLinkEditor(null)} className="admin-secondary-button"><span>Cancel</span></button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
