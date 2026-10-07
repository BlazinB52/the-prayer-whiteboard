"use client";

import type { ReactNode } from "react";

// A submit button that asks first. The server action does the real work and the real checks.
export function ConfirmButton({ message, className, children, name, value }: { message: string; className?: string; children: ReactNode; name?: string; value?: string }) {
  return (
    <button
      type="submit"
      name={name}
      value={value}
      className={className}
      onClick={(event) => {
        if (!window.confirm(message)) event.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
