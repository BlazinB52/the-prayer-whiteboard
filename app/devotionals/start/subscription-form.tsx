"use client";

import { useEffect } from "react";

const SENDER_FORM_ID = "dyPEr6";

declare global {
  interface Window {
    senderForms?: {
      render?: (forms?: string | string[]) => void;
    };
    senderFormsLoaded?: boolean;
  }
}

export function DevotionalSubscriptionForm() {
  useEffect(() => {
    const renderSenderForm = () => {
      window.senderForms?.render?.(SENDER_FORM_ID);
    };

    if (window.senderFormsLoaded) {
      renderSenderForm();
      return;
    }

    window.addEventListener("onSenderFormsLoaded", renderSenderForm);

    return () => {
      window.removeEventListener("onSenderFormsLoaded", renderSenderForm);
    };
  }, []);

  return (
    <div className="mt-7 max-w-full overflow-hidden">
      <div
        className="sender-form-field max-w-full"
        data-sender-form-id={SENDER_FORM_ID}
        style={{ textAlign: "left" }}
      />
    </div>
  );
}
