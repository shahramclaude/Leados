import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import "./globals.css";
import { ActorProvider } from "@/lib/actorContext";
import { ActorSwitcher } from "@/components/ActorSwitcher";

export const metadata: Metadata = {
  title: "LEADOS — People Intelligence",
  description: "People intelligence: flight-risk, succession, 1:1s, growth, org health — explainable and fair.",
};

const NAV = [
  { href: "/", label: "Home" },
  { href: "/people", label: "People" },
  { href: "/talent", label: "Talent" },
  { href: "/team-health", label: "Team health" },
];

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-slate-100 text-slate-900 antialiased">
        <ActorProvider>
          <header className="border-b border-slate-200 bg-white">
            <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-6 py-3">
              <div className="flex items-center gap-6">
                <span className="text-sm font-bold tracking-tight text-slate-900">LEADOS</span>
                <nav className="flex gap-4 text-sm">
                  {NAV.map((n) => (
                    <Link key={n.href} href={n.href} className="text-slate-600 hover:text-indigo-700">
                      {n.label}
                    </Link>
                  ))}
                </nav>
              </div>
              <ActorSwitcher />
            </div>
          </header>
          {children}
        </ActorProvider>
      </body>
    </html>
  );
}
