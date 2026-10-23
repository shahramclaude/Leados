import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Leados Coverage Matrix — Phase-0 Verification",
  description:
    "Live Phase-0 verification workspace for the Leados Parts 00-58 coverage matrix seed.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-slate-100 text-slate-900 antialiased">
        <nav className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-3 text-sm">
            <Link href="/" className="font-semibold text-slate-900">
              Leados Coverage Matrix
            </Link>
            <Link href="/" className="text-slate-600 hover:text-slate-900">
              Dashboard
            </Link>
            <Link href="/gaps" className="text-slate-600 hover:text-slate-900">
              Gaps register
            </Link>
            <Link href="/method" className="text-slate-600 hover:text-slate-900">
              Method & contract gaps
            </Link>
          </div>
        </nav>
        {children}
      </body>
    </html>
  );
}
