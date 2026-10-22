import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { ActorProvider } from "@/components/ActorProvider";
import { NotificationTray } from "@/components/NotificationTray";
import Link from "next/link";

export const metadata: Metadata = {
  title: "LEADOS — Now",
  description: "Realtime attention surface for LEADOS.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-slate-100 text-slate-900 antialiased">
        <ActorProvider>
          <div className="min-h-screen">
            <header className="sticky top-0 z-40 flex items-center justify-between border-b border-slate-200 bg-white/90 px-6 py-3 backdrop-blur">
              <div className="flex items-center gap-6">
                <span className="text-sm font-semibold tracking-tight text-slate-900">LEADOS</span>
                <nav className="flex gap-4 text-sm text-slate-500">
                  <Link href="/" className="hover:text-slate-900">
                    Now
                  </Link>
                  <Link href="/attention-report" className="hover:text-slate-900">
                    Attention Report
                  </Link>
                </nav>
              </div>
              <NotificationTray />
            </header>
            <main>{children}</main>
          </div>
        </ActorProvider>
      </body>
    </html>
  );
}
