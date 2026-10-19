import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Leados — People Intelligence",
  description: "Flight risk, burnout, 1:1 quality and org dynamics for every person on the team.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-[#0a0c10] text-slate-100 antialiased" style={{ fontFamily: "system-ui, sans-serif" }}>
        <div className="min-h-screen flex flex-col">
          <header className="border-b border-white/10 px-6 py-3 flex items-center gap-6">
            <span className="font-semibold tracking-tight text-slate-100">Leados</span>
            <nav className="flex gap-4 text-sm text-slate-400">
              <Link href="/" className="hover:text-slate-100 transition-colors">
                Home
              </Link>
              <Link href="/people" className="hover:text-slate-100 transition-colors">
                People Intelligence
              </Link>
            </nav>
          </header>
          <main className="flex-1">{children}</main>
        </div>
      </body>
    </html>
  );
}
