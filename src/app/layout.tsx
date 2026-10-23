import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import "./globals.css";
import { ActorProvider } from "@/components/ActorPicker";

export const metadata: Metadata = {
  title: "LEADOS — Part 46: Ethics, Safe Channels & Power Checks",
  description: "Ethical decision framework, ombudsman-grade safe channel, dual-control power checks, and dissent preservation.",
};

const NAV = [
  { href: "/", label: "Overview" },
  { href: "/ethics", label: "Ethics Review" },
  { href: "/safe-channel", label: "Safe Channel" },
  { href: "/power", label: "Power Dashboard" },
  { href: "/dissent", label: "Suggestion / Whisper" },
];

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-slate-100 text-slate-900 antialiased">
        <ActorProvider>
          <div className="min-h-screen">
            <header className="border-b border-slate-200 bg-white">
              <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-4">
                <div>
                  <p className="m-0 text-xs uppercase tracking-[0.1em] text-slate-500">LEADOS · Part 46</p>
                  <p className="m-0 text-lg font-semibold text-slate-950">Ethics, Safe Channels &amp; Power Checks</p>
                </div>
                <nav className="flex flex-wrap gap-4 text-sm font-medium text-slate-600">
                  {NAV.map((item) => (
                    <Link key={item.href} href={item.href} className="hover:text-slate-950">
                      {item.label}
                    </Link>
                  ))}
                </nav>
              </div>
            </header>
            <main className="mx-auto max-w-6xl px-6 py-10">{children}</main>
          </div>
        </ActorProvider>
      </body>
    </html>
  );
}
