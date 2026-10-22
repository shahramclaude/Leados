import type { Metadata } from "next";
import type { ReactNode } from "react";
import CommandPalette from "@/components/CommandPalette";
import "./globals.css";

export const metadata: Metadata = {
  title: "LEADOS",
  description: "LEADOS — grounded conversational leadership operating system.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-slate-100 text-slate-900 antialiased">
        {children}
        {/* Ask-LEADOS is a layer over the whole product, not a page. */}
        <CommandPalette />
      </body>
    </html>
  );
}
