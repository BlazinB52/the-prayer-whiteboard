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
    status: "Available",
    href: "/admin/teachings",
  },
  {
    title: "Devotionals",
    description: "Import and publish 7-day devotional series.",
    status: "Available",
    href: "/admin/devotionals",
  },
  {
    title: "Chalkboards",
    description: "Manage the visual teaching assets.",
    status: "Available",
    href: "/admin/chalkboards",
  },
  {
    title: "Points of Agreement",
    description: "Curate the Prayer & Intercession Guide.",
    status: "Available",
    href: "/admin/points-of-agreement",
  },
  {
    title: "Weekly Updates",
    description: "Publish the current weekly update and manage archives.",
    status: "Available",
    href: "/admin/weekly-updates",
  },
  {
    title: "Footers",
    description: "Manage reusable footer text for teachings and Weekly Updates.",
    status: "Available",
    href: "/admin/footers",
  },
  {
    title: "Email Subscribers",
    description: "View opt-in status, category preferences, and Sender sync state.",
    status: "Available",
    href: "/admin/subscribers",
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
            {tools.map((tool) => {
              const card = (
                <article className="min-h-44 rounded-2xl border border-[#284a3b]/10 bg-[#fffdf8] p-6 shadow-lg shadow-[#4d5f52]/8 transition hover:-translate-y-0.5 hover:border-[#a85e32]/30">
                  <div className="flex items-start justify-between gap-4">
                    <h2 className="text-2xl font-extrabold text-[#243d31]">{tool.title}</h2>
                    <span className="shrink-0 rounded-full bg-[#e7efe9] px-3 py-1 text-[10px] font-black uppercase tracking-wider text-[#326048]">
                      {tool.status}
                    </span>
                  </div>
                  <p className="mt-5 max-w-sm leading-7 text-[#607066]">{tool.description}</p>
                </article>
              );

              return tool.href ? (
                <Link key={tool.title} href={tool.href} className="block focus-visible:rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#a85e32]">
                  {card}
                </Link>
              ) : (
                <div key={tool.title}>{card}</div>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}
