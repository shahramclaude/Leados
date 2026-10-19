import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Leados — Strategic Intelligence",
  description: "Strategic intelligence layer: scenarios, wargames, real options, and OKRs.",
};

const NAV_ITEMS = [
  { href: "/", label: "Home" },
  { href: "/strategic", label: "Strategic" },
  { href: "/decision-trees", label: "Decision Trees" },
  { href: "/inference", label: "Inference" },
];

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-slate-100 text-slate-900 antialiased">
        <nav className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-4">
            <span className="text-sm font-semibold uppercase tracking-wide text-slate-900">Leados</span>
            <div className="flex gap-4 text-sm text-slate-600">
              {NAV_ITEMS.map((item) => (
                <Link key={item.href} href={item.href} className="hover:text-slate-950">
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        </nav>
        {children}
      </body>
    </html>
  );
}
