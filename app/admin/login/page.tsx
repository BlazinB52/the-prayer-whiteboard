import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LoginForm } from "./login-form";
import { getAuthorizedUser } from "@/lib/supabase/admin";

export const metadata: Metadata = {
  title: "Administrator Sign In",
  robots: { index: false, follow: false },
};

export default async function AdminLoginPage() {
  const user = await getAuthorizedUser();

  if (user) {
    redirect("/admin");
  }

  return (
    <main className="min-h-screen bg-[#f7f2e8] px-5 py-10 text-[#243126] sm:px-8 sm:py-16">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-6xl items-center justify-center">
        <section className="grid w-full max-w-4xl overflow-hidden rounded-[2rem] border border-[#284a3b]/10 bg-[#fffdf8] shadow-2xl shadow-[#4d5f52]/15 md:grid-cols-[0.9fr_1.1fr]">
          <div className="bg-[#244a3a] px-7 py-10 text-white sm:px-10 sm:py-12">
            <Link href="/" className="text-sm font-extrabold text-[#f1c66f]">
              The Whiteboard
            </Link>
            <div className="mt-16 max-w-xs">
              <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#f0cb83]">
                Private workspace
              </p>
              <h1 className="mt-4 text-4xl font-extrabold leading-tight">
                Welcome back.
              </h1>
              <p className="mt-5 leading-7 text-[#dce8e1]">
                Sign in to manage the prayer group&apos;s published content.
              </p>
            </div>
          </div>
          <div className="px-7 py-10 sm:px-10 sm:py-12">
            <div className="max-w-md">
              <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#946332]">
                Administrator access
              </p>
              <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-[#243d31]">
                Sign in
              </h2>
              <p className="mt-3 text-sm leading-6 text-[#607066]">
                Use your administrator credentials to continue.
              </p>
              <LoginForm />
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
