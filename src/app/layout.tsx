import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Shell } from "@/components/Shell";
import "./globals.css";

export const metadata: Metadata = {
  title: "LEADOS — Executive Decision Intelligence",
  description:
    "LEADOS: decision governance, sensing, risk, agent kernel, and organizational fitness in one cockpit.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-slate-950 text-slate-100 antialiased">
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
