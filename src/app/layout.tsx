import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { Nav } from "@/components/Nav";

export const metadata: Metadata = {
  title: "LEADOS Operations Console",
  description: "Financial close, source-to-pay, ITSM, HSE, and treasury operations in one console.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-slate-50 text-slate-900 antialiased">
        <Nav />
        <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
