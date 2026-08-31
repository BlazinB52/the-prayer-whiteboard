"use client";

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="admin-primary-button">
      <span>Print Teaching</span>
    </button>
  );
}