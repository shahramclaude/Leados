import type { Metadata } from "next";
import type { ReactNode } from "react";
import NavBar from "@/components/NavBar";
import "./globals.css";

export const metadata: Metadata = {
  title: "LEADOS — Decision Operating System",
  description:
    "Executive decision-operations platform: deterministic lead scoring, a hash-chained evidence ledger, and pipeline forecasting.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        <NavBar />
        {children}
      </body>
    </html>
  );
}
