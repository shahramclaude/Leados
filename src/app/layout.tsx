import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import "./globals.css";
import Banners from "./components/Banners";

export const metadata: Metadata = {
  title: "LEADOS — SRE Console",
  description: "LEADOS Part 20: telemetry, health, maintenance mode, and incident/trace tooling.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-slate-100 text-slate-900 antialiased">
        <Banners />
        <header className="border-b border-slate-200 bg-white px-6 py-3">
          <nav className="mx-auto flex max-w-5xl items-center gap-6 text-sm font-medium text-slate-700">
            <Link href="/" className="font-semibold text-slate-950">
              LEADOS
            </Link>
            <Link href="/health" className="hover:text-slate-950">
              Health
            </Link>
            <Link href="/trace" className="hover:text-slate-950">
              Trace viewer
            </Link>
            <a
              href="https://github.com/shahramclaude/Leados/blob/main/docs/RUNBOOKS.md"
              className="ml-auto text-slate-500 hover:text-slate-950"
            >
              Runbooks ↗
            </a>
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}
