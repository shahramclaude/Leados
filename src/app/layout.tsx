import type { Metadata } from "next";
import type { ReactNode } from "react";
import { headers } from "next/headers";
import "./globals.css";

export const metadata: Metadata = {
  title: "LEADOS",
  description: "LEADOS — Part 17: security-hardened foundation.",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Reading the nonce here is mostly illustrative: Next.js auto-applies the
  // nonce from the `Content-Security-Policy` request header (set in
  // src/proxy.ts) to its own framework-injected scripts. If this app adds a
  // hand-written <script> tag in the future, pass `nonce={nonce}` on it.
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html lang="en" data-csp-nonce={nonce}>
      <body className="bg-slate-50 text-slate-900 antialiased">{children}</body>
    </html>
  );
}
