import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Sidebar } from "@/components/Sidebar";
import "./globals.css";

export const metadata: Metadata = {
  title: "LEADOS — Executive Intelligence Cockpit",
  description:
    "LEADOS is a leadership operating system: decisions, signals, cadence, board governance, risk, and strategy in one cockpit.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-slate-100 text-slate-900 antialiased">
        <div className="flex min-h-screen">
          <Sidebar />
          <main className="flex-1 overflow-y-auto px-8 py-10 sm:px-12">
            <div className="mx-auto max-w-6xl">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}
