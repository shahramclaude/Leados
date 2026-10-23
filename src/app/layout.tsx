import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import Shell from "@/components/leados/Shell";

export const metadata: Metadata = {
  title: "LEADOS — Strategic Frontier & AI-Native Organization",
  description: "Pack 4 (Parts 108-123): innovation, brand, partnerships, M&A, regulatory, executive team, negotiation, succession, digital coworkers, self-evolving architecture, and the program gate.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-slate-100 text-slate-900 antialiased">
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
