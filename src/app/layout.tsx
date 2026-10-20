import type { Metadata } from "next";
import type { ReactNode } from "react";
import { headers } from "next/headers";
import "./globals.css";
import { SessionProvider } from "@/components/SessionProvider";
import { NavBar } from "@/components/NavBar";

export const metadata: Metadata = {
  title: "LEADOS",
  description: "LEADOS — secure organizational people data platform.",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Nonce minted per-request by proxy.ts (see that file's CSP comment).
  // Not currently consumed by an inline script (we ship none), but kept
  // wired end-to-end so any future <script nonce={nonce}> stays CSP-strict
  // instead of someone reaching for 'unsafe-inline'.
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html lang="en" data-csp-nonce={nonce}>
      <body className="min-h-screen bg-slate-100 text-slate-900 antialiased">
        <SessionProvider>
          <NavBar />
          {children}
        </SessionProvider>
      </body>
    </html>
  );
}
