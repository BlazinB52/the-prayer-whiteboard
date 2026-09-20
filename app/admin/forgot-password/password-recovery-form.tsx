"use client";

import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function PasswordRecoveryForm() {
  const [message, setMessage] = useState<{ error?: string; sent?: boolean }>({});
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage({});
    setPending(true);

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "").trim();
    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/admin/reset-password`,
    });

    setPending(false);
    if (error) {
      setMessage({ error: "A recovery email could not be sent right now. Please wait a few minutes and try again." });
      return;
    }
    setMessage({ sent: true });
  }

  if (message.sent) {
    return (
      <p role="status" className="mt-8 rounded-xl border border-[#326048]/20 bg-[#e7efe9] px-4 py-3 text-sm font-bold leading-6 text-[#244a3a]">
        Check your email for a password-reset link. For security, this message is the same whether or not the address matches an account.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 space-y-5">
      <label className="block text-sm font-bold text-[#385245]">
        Administrator email
        <input name="email" type="email" autoComplete="email" required className="admin-input" />
      </label>
      {message.error ? <p role="alert" className="text-sm font-bold text-[#a2472c]">{message.error}</p> : null}
      <button type="submit" disabled={pending} className="admin-primary-button w-full">
        <span>{pending ? "Sending..." : "Send reset link"}</span>
      </button>
    </form>
  );
}
