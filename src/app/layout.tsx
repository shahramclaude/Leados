import type { Metadata } from "next";
import type { ReactNode } from "react";
import { TopNav } from "@/components/accountability/TopNav";
import "./globals.css";

export const metadata: Metadata = {
  title: "LEADOS — Algorithmic Accountability (Part 56)",
  description:
    "Model/system registry, impact assessments, individual rights machinery and conformity evidence export for every scoring, predicting, recommending and automated-decision engine in LEADOS.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-100 text-slate-900 antialiased">
        <TopNav />
        {children}
      </body>
    </html>
  );
}
