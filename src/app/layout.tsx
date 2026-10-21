import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "LEADOS — Strategy & Finance Cockpit",
  description: "Driver-based financial model, OKR cascade, probabilistic execution, decision intelligence, and board-pack generation.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-slate-100 text-slate-900 antialiased">{children}</body>
    </html>
  );
}
