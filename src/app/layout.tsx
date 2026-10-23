import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "LEADOS — Executive Decision Intelligence",
  description: "Decision governance, early-warning signals, and org intelligence for executive teams.",
};

const NAV_LINKS = [
  { href: "/", label: "Cockpit" },
  { href: "/decisions", label: "Decisions" },
  { href: "/signals", label: "Signals" },
  { href: "/people", label: "People" },
];

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-100 text-slate-900 antialiased">
        <div className="flex min-h-screen flex-col">
          <header className="border-b border-slate-200 bg-slate-950 text-slate-100">
            <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
              <Link href="/" className="flex items-center gap-2">
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-indigo-500 text-sm font-bold">
                  LX
                </span>
                <div>
                  <p className="text-sm font-semibold leading-tight">LEADOS</p>
                  <p className="text-[11px] uppercase tracking-[0.16em] text-slate-400">
                    Decision Intelligence
                  </p>
                </div>
              </Link>
              <nav className="flex items-center gap-1">
                {NAV_LINKS.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="rounded-md px-3 py-2 text-sm font-medium text-slate-300 transition hover:bg-slate-800 hover:text-white"
                  >
                    {link.label}
                  </Link>
                ))}
              </nav>
            </div>
          </header>
          <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">{children}</main>
          <footer className="border-t border-slate-200 bg-white py-4 text-center text-xs text-slate-500">
            LEADOS Executive Command Center — decision governance &amp; early warning
          </footer>
        </div>
      </body>
    </html>
  );
}
