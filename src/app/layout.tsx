import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "LeadOS pt-T",
  description:
    "LeadOS pt-T — Strategic Consciousness, Decision Oracle, and Knowledge Graph. Served as a self-contained static index.html.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-slate-100 text-slate-900 antialiased">{children}</body>
    </html>
  );
}
