import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/alternates";
import Link from "next/link";
import { isStaffLinkType } from "@/lib/staff-links";
import { confirmStaffLink } from "./actions";

export const metadata: Metadata = { ...buildPageMetadata({ title: "Continue to Your Account", path: "/auth/confirm", noindex: true }), referrer: "no-referrer" };

export const dynamic = "force-dynamic";

export default async function ConfirmStaffLinkPage({
  searchParams,
}: {
  searchParams: Promise<{ token_hash?: string; type?: string }>;
}) {
  const { token_hash: tokenHash = "", type = "" } = await searchParams;
  const valid = Boolean(tokenHash) && isStaffLinkType(type);
  const isInvite = type === "invite";

  return (
    <main className="min-h-screen bg-[#f7f2e8] px-5 py-10 text-[#243126] sm:px-8 sm:py-16">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-xl items-center justify-center">
        <section className="w-full rounded-2xl border border-[#284a3b]/10 bg-[#fffdf8] px-7 py-10 shadow-2xl shadow-[#4d5f52]/15 sm:px-10 sm:py-12">
          <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#946332]">Account access</p>
          {valid ? (
            <>
              <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-[#243d31]">
                {isInvite ? "Welcome to Content Management" : "Reset your password"}
              </h1>
              <p className="mt-3 text-sm leading-6 text-[#607066]">
                {isInvite
                  ? "Click Continue to set up your password. You will use your email address and this password to sign in."
                  : "Click Continue to choose a new password."}
              </p>
              <form action={confirmStaffLink} className="mt-8">
                <input type="hidden" name="token_hash" value={tokenHash} />
                <input type="hidden" name="type" value={type} />
                <button type="submit" className="admin-primary-button w-full">
                  <span>Continue</span>
                </button>
              </form>
            </>
          ) : (
            <>
              <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-[#243d31]">This link is not valid</h1>
              <p role="alert" className="mt-5 rounded-xl border border-[#a2472c]/20 bg-[#fff4ef] px-4 py-3 text-sm font-bold leading-6 text-[#a2472c]">
                The link is incomplete or has expired. Ask the administrator to send a new one.
              </p>
            </>
          )}
          <Link href="/admin/login" className="mt-6 inline-flex text-sm font-extrabold text-[#946332] underline-offset-4 hover:underline">
            Go to sign in
          </Link>
        </section>
      </div>
    </main>
  );
}
