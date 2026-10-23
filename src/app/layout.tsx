import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { ActorProvider } from "@/components/governance/ActorContext";
import { NavBar } from "@/components/governance/NavBar";

export const metadata: Metadata = {
  title: "LEADOS — Board Governance",
  description: "Board cycle engine, resolution register, and governance oversight for LEADOS.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-slate-100 text-slate-900 antialiased">
        <ActorProvider>
          <NavBar />
          {children}
        </ActorProvider>
      </body>
    </html>
  );
}
