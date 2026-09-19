"use client";

import { useEffect } from "react";

declare global {
  interface Window {
    senderForms?: {
      render?: (forms?: string | string[]) => void;
    };
    senderFormsLoaded?: boolean;
  }
}

export function DevotionalSubscriptionForm({ formId }: { formId: string }) {
  useEffect(() => {
    const renderSenderForm = () => {
      window.senderForms?.render?.(formId);
    };

    if (window.senderFormsLoaded) {
      renderSenderForm();
      return;
    }

    window.addEventListener("onSenderFormsLoaded", renderSenderForm);

    return () => {
      window.removeEventListener("onSenderFormsLoaded", renderSenderForm);
    };
  }, [formId]);

  return (
    <div className="mt-7 max-w-full overflow-hidden">
      <div
        className="sender-form-field max-w-full"
        data-sender-form-id={formId}
        style={{ textAlign: "left" }}
      />
    </div>
  );
}
