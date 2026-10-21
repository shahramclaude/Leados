import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import Nav from "@/components/Nav";

export const metadata: Metadata = {
  title: "LEADOS",
  description: "LEADOS — capture, finding, decision, approval, automation, board pack.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased dark:bg-slate-950 dark:text-slate-100">
        <Nav />
        <div className="mx-auto max-w-6xl px-6 py-10">{children}</div>
      </body>
    </html>
  );
}
