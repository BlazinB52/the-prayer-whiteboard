import type { Metadata } from "next";
import Link from "next/link";
import { signOut } from "./actions";
import { requireAdmin } from "@/lib/supabase/admin";

export const metadata: Metadata = {
  title: "Prayer Whiteboard Editor",
  robots: { index: false, follow: false },
};

const tools = [
  {
    title: "Teachings",
    description: "Create and organize published teachings.",
    status: "Coming next",
  },
  {
    title: "Chalkboards",
    description: "Manage the visual teaching assets.",
    status: "Coming next",
  },
  {
    title: "Homepage Settings",
    description: "Shape the public Whiteboard experience.",
    status: "Coming next",
  },
  {
    title: "Calendar",
    description: "Plan future gatherings and publishing dates.",
    status: "Planned for later",
  },
];

export default async function AdminDashboardPage() {
  const { user } = await requireAdmin();

  return (
    <main className="min-h-screen bg-[#f7f2e8] px-5 py-8 text-[#243126] sm:px-8 sm:py-12">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-col gap-5 border-b border-[#284a3b]/10 pb-8 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#946332]">
              Private workspace
            </p>
            <h1 className="mt-3 text-4xl font-extrabold tracking-tight text-[#243d31] sm:text-5xl">
              Prayer Whiteboard Editor
            </h1>
            <p className="mt-3 text-sm text-[#607066]">Signed in as {user.email}</p>
          </div>
          <form action={signOut}>
            <button
              type="submit"
              className="min-h-11 rounded-xl border border-[#284a3b]/15 bg-white px-5 font-extrabold text-[#244a3a] transition hover:border-[#a85e32]/40 hover:text-[#a85e32]"
            >
              Sign Out
            </button>
          </form>
        </header>

        <section className="py-10">
          <div className="grid gap-5 sm:grid-cols-2">
            {tools.map((tool) => (
              <article
                key={tool.title}
                className="min-h-44 rounded-2xl border border-[#284a3b]/10 bg-[#fffdf8] p-6 shadow-lg shadow-[#4d5f52]/8"
              >
                <div className="flex items-start justify-between gap-4">
                  <h2 className="text-2xl font-extrabold text-[#243d31]">
                    {tool.title === "Teachings" ? (
                      <Link href="/admin/teachings" className="transition hover:text-[#a85e32]">
                        {tool.title}
                      </Link>
                    ) : (
                      tool.title
                    )}
                  </h2>
                  <span className="shrink-0 rounded-full bg-[#e7efe9] px-3 py-1 text-[10px] font-black uppercase tracking-wider text-[#326048]">
                    {tool.status}
                  </span>
                </div>
                <p className="mt-5 max-w-sm leading-7 text-[#607066]">{tool.description}</p>
              </article>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
