import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { Nav } from "./components/Nav";

export const metadata: Metadata = {
  title: "LEADOS — Proactive Workflow Architect",
  description: "Commitment ledger, delegation intelligence, proactive drafts, and loop closure for LEADOS.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-slate-100 text-slate-900 antialiased">
        <Nav />
        {children}
      </body>
    </html>
  );
}
