import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "LEADOS — Intelligence & Automation Core",
  description: "World model, reasoning, causal discovery, strategy, next-best-action, and governed autonomy.",
};

const NAV = [
  { href: "/", label: "Overview" },
  { href: "/simulate", label: "World Model" },
  { href: "/reasoning", label: "Reasoning" },
  { href: "/causal", label: "Causal / RCA" },
  { href: "/strategy", label: "Strategy" },
  { href: "/actions", label: "Next-Best-Action" },
  { href: "/governance", label: "Governance" },
  { href: "/quality", label: "Quality" },
  { href: "/autonomy", label: "Autonomy" },
];

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased">
        <div className="flex min-h-screen">
          <aside className="hidden w-64 shrink-0 border-r border-slate-800 bg-slate-900/60 p-5 lg:block">
            <div className="mb-8">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">LEADOS</p>
              <p className="mt-1 text-lg font-semibold text-slate-50">Intelligence &amp; Automation Core</p>
            </div>
            <nav className="space-y-1">
              {NAV.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className="block rounded-lg px-3 py-2 text-sm text-slate-300 transition hover:bg-slate-800 hover:text-white"
                >
                  {n.label}
                </Link>
              ))}
            </nav>
          </aside>
          <div className="flex-1">
            <header className="flex items-center justify-between border-b border-slate-800 bg-slate-900/40 px-6 py-3 lg:hidden">
              <p className="text-sm font-semibold">LEADOS</p>
            </header>
            <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}
