import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { Shell } from "@/components/Shell";

export const metadata: Metadata = {
  title: "LEADOS Intelligence Console",
  description:
    "LEADOS business-intelligence and platform-governance console: revenue, customer, supply chain, collaboration, trust, and hardening dashboards.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-slate-50 text-slate-900 antialiased">
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
