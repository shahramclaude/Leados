import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "LEADOS — Autonomous Leadership Intelligence",
  description:
    "LEADOS is an autonomous leadership-intelligence operating system: it tracks organizations and leaders, computes leadership readiness from a pure domain engine, and records every change to an append-only event log.",
  openGraph: {
    title: "LEADOS — Autonomous Leadership Intelligence",
    description:
      "An autonomous leadership-intelligence operating system built on Next.js, Drizzle, and PostgreSQL.",
    type: "website",
  },
};

const NAV_LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/organizations", label: "Organizations" },
  { href: "/leaders", label: "Leaders" },
];

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-slate-100 text-slate-900 antialiased">
        <div className="min-h-screen">
          <header className="border-b border-slate-200 bg-white">
            <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
              <Link href="/" className="text-lg font-semibold tracking-tight text-slate-950">
                LEAD<span className="text-indigo-600">OS</span>
              </Link>
              <nav className="flex gap-6 text-sm font-medium text-slate-600">
                {NAV_LINKS.map((link) => (
                  <Link key={link.href} href={link.href} className="hover:text-slate-950">
                    {link.label}
                  </Link>
                ))}
              </nav>
            </div>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
