import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { AppProvider } from "@/context/AppContext";
import { NavBar } from "@/components/NavBar";

export const metadata: Metadata = {
  title: "Leados — Organizational Intelligence Command Center",
  description: "Belief fabric, people/financial/strategic/execution intelligence, and the knowledge graph in one cockpit.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased">
        <AppProvider>
          <NavBar />
          <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
        </AppProvider>
      </body>
    </html>
  );
}
