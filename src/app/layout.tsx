import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { Chrome } from "@/components/nav/Chrome";

export const metadata: Metadata = {
  title: "LEADOS — Leadership Operating System",
  description:
    "The leadership and management operating system: decisions, plans, approvals, knowledge, and audit in one command-first surface.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">
        <Chrome>{children}</Chrome>
      </body>
    </html>
  );
}
