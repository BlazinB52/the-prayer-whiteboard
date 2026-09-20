import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthorizedUser } from "@/lib/supabase/admin";
import { UpdatePasswordForm } from "./update-password-form";

export const metadata: Metadata = {
  title: "Reset Administrator Password",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function UpdatePasswordPage() {
  const user = await getAuthorizedUser();

  if (!user) {
    redirect("/admin/login?error=recovery");
  }

  return (
    <main className="min-h-screen bg-[#f7f2e8] px-5 py-10 text-[#243126] sm:px-8 sm:py-16">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-xl items-center justify-center">
        <section className="w-full rounded-2xl border border-[#284a3b]/10 bg-[#fffdf8] px-7 py-10 shadow-2xl shadow-[#4d5f52]/15 sm:px-10 sm:py-12">
          <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#946332]">Administrator access</p>
          <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-[#243d31]">Choose a new password</h1>
          <p className="mt-3 text-sm leading-6 text-[#607066]">Enter your new password twice to finish recovering your account.</p>
          <UpdatePasswordForm />
          <Link href="/admin/login" className="mt-6 inline-flex text-sm font-extrabold text-[#946332] underline-offset-4 hover:underline">
            Back to sign in
          </Link>
        </section>
      </div>
    </main>
  );
}
