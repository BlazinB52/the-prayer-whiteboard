import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Reset Administrator Password",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function ResetAdminPasswordPage() {
  return (
    <main className="min-h-screen bg-[#f7f2e8] px-5 py-10 text-[#243126] sm:px-8 sm:py-16">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-xl items-center justify-center">
        <section className="w-full rounded-2xl border border-[#284a3b]/10 bg-[#fffdf8] px-7 py-10 shadow-2xl shadow-[#4d5f52]/15 sm:px-10 sm:py-12">
          <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#946332]">Administrator access</p>
          <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-[#243d31]">Confirm password reset</h1>
          <p role="alert" className="mt-5 rounded-xl border border-[#a2472c]/20 bg-[#fff4ef] px-4 py-3 text-sm font-bold leading-6 text-[#a2472c]">
            This password reset link is no longer valid. Please request a new one.
          </p>
          <Link href="/admin/forgot-password" className="mt-6 inline-flex text-sm font-extrabold text-[#946332] underline underline-offset-4">
            Request a new password-reset email
          </Link>
        </section>
      </div>
    </main>
  );
}
