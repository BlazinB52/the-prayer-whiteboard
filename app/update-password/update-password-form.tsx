"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function UpdatePasswordForm() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [errorMessage, setErrorMessage] = useState("");
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");

    const formData = new FormData(event.currentTarget);
    const password = String(formData.get("password") ?? "");
    const confirmation = String(formData.get("passwordConfirmation") ?? "");
    if (password.length < 8) {
      setErrorMessage("Use a password with at least 8 characters.");
      return;
    }
    if (password !== confirmation) {
      setErrorMessage("The passwords do not match.");
      return;
    }

    setPending(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setPending(false);
      setErrorMessage("This recovery link is invalid or expired. Request a new password-reset email.");
      return;
    }

    await supabase.auth.signOut();
    router.replace("/admin/login?reset=success");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 space-y-5">
      <label className="block text-sm font-bold text-[#385245]">
        New password
        <input name="password" type="password" autoComplete="new-password" minLength={8} required className="admin-input" />
      </label>
      <label className="block text-sm font-bold text-[#385245]">
        Confirm new password
        <input name="passwordConfirmation" type="password" autoComplete="new-password" minLength={8} required className="admin-input" />
      </label>
      {errorMessage ? <p role="alert" className="text-sm font-bold text-[#a2472c]">{errorMessage}</p> : null}
      <button type="submit" disabled={pending} className="admin-primary-button w-full">
        <span>{pending ? "Updating..." : "Update password"}</span>
      </button>
    </form>
  );
}
