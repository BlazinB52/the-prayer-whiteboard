"use client";

export function PrintPreviewButton({ label = "Print" }: { label?: string }) {
  return (
    <button type="button" onClick={() => window.print()} className="admin-primary-button">
      <span>{label}</span>
    </button>
  );
}
