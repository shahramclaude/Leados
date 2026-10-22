import type { Metadata } from "next";
import type { ReactNode } from "react";
import { headers } from "next/headers";
import "./globals.css";
import { IncidentBanner } from "@/components/IncidentBanner";
import { NavBar } from "@/components/NavBar";
import { getSession } from "@/lib/session";

export const metadata: Metadata = {
  title: "LEADOS",
  description: "LEADOS — security-hardened org intelligence slice (Part 19).",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const hdrs = await headers();
  const nonce = hdrs.get("x-csp-nonce") ?? undefined;
  const session = await getSession();

  return (
    <html lang="en">
      <body className="bg-slate-100 text-slate-900 antialiased" data-csp-nonce={nonce}>
        <IncidentBanner />
        <NavBar session={session} />
        <div className="mx-auto max-w-5xl px-6 py-8">{children}</div>
      </body>
    </html>
  );
}
