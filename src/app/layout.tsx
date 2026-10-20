import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { RealtimeProvider } from "@/components/RealtimeProvider";
import { NotificationTray } from "@/components/NotificationTray";

export const metadata: Metadata = {
  title: "LEADOS — Now",
  description: "Decision-first cockpit with realtime notifications and attention management.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-slate-100 text-slate-900 antialiased">
        <RealtimeProvider />
        <div className="sticky top-0 z-40 border-b border-slate-200 bg-white/80 backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
            <span className="text-sm font-semibold tracking-tight text-slate-900">LEADOS</span>
            <NotificationTray />
          </div>
        </div>
        {children}
      </body>
    </html>
  );
}
