import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

const title = "LEADOS — Leadership Intelligence Operating System";
const description =
  "LEADOS is an autonomous leadership-intelligence operating system. This build is the Part 0 ground-truth foundation: Next.js App Router, Postgres via Drizzle, a layered src/lib architecture, and a versioned event schema registry.";

export const metadata: Metadata = {
  title,
  description,
  applicationName: "LEADOS",
  openGraph: {
    title,
    description,
    siteName: "LEADOS",
    type: "website",
  },
  twitter: {
    card: "summary",
    title,
    description,
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-slate-100 text-slate-900 antialiased">{children}</body>
    </html>
  );
}
