"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function LoginForm({ passwordReset = false }: { passwordReset?: boolean }) {
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setErrorMessage("The email or password is not valid.");
      setIsSubmitting(false);
      return;
    }

    router.replace("/admin");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 space-y-5">
      {passwordReset ? (
        <p role="status" className="rounded-xl border border-[#326048]/20 bg-[#e7efe9] px-4 py-3 text-sm font-bold text-[#244a3a]">
          Your password has been updated. Sign in with your new password.
        </p>
      ) : null}
      <label className="block text-sm font-bold text-[#385245]">
        Email
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          className="mt-2 block min-h-12 w-full rounded-xl border border-[#284a3b]/15 bg-white px-4 text-base font-normal text-[#243126] outline-none transition focus:border-[#a85e32] focus:ring-2 focus:ring-[#a85e32]/20"
        />
      </label>
      <label className="block text-sm font-bold text-[#385245]">
        <span className="flex items-center justify-between gap-4">
          <span>Password</span>
          <Link href="/admin/forgot-password" className="text-xs font-extrabold text-[#946332] underline-offset-4 hover:underline">
            Forgot password?
          </Link>
        </span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="mt-2 block min-h-12 w-full rounded-xl border border-[#284a3b]/15 bg-white px-4 text-base font-normal text-[#243126] outline-none transition focus:border-[#a85e32] focus:ring-2 focus:ring-[#a85e32]/20"
        />
      </label>
      {errorMessage ? (
        <p role="alert" className="text-sm font-bold text-[#a2472c]">
          {errorMessage}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={isSubmitting}
        className="min-h-12 w-full rounded-xl bg-[#244a3a] px-5 font-extrabold text-white transition hover:bg-[#1d3d30] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSubmitting ? "Signing in..." : "Sign In"}
      </button>
    </form>
  );
}
