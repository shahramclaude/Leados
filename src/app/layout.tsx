import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Arena Next.js PostgreSQL Starter",
  description: "Starter template with Next.js, Drizzle, and PostgreSQL.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-slate-100 text-slate-900 antialiased">
        <nav className="border-b border-slate-200 bg-white px-6 py-3">
          <div className="mx-auto flex max-w-5xl items-center gap-6 text-sm font-medium">
            <Link href="/" className="text-slate-900">
              Arena Starter
            </Link>
            <Link href="/world-model" className="text-slate-500 hover:text-slate-900">
              World Model
            </Link>
          </div>
        </nav>
        {children}
      </body>
    </html>
  );
}
