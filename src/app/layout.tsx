import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "LEADOS — Organizational Intelligence",
  description: "LEADOS: human-commanded organizational intelligence across fitness, assurance, risk, consolidation, VoC, and automation.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-slate-100 text-slate-900 antialiased">{children}</body>
    </html>
  );
}
