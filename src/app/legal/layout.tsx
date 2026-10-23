import type { ReactNode } from "react";
import Link from "next/link";
import { LegalDisclaimerBanner } from "@/components/LegalDisclaimerBanner";

const NAV = [
  { href: "/legal", label: "Overview" },
  { href: "/legal/vault", label: "Contract Vault" },
  { href: "/legal/obligations", label: "Obligation Board" },
  { href: "/legal/counterparties", label: "Counterparty Dossiers" },
  { href: "/legal/calendar", label: "Renewal Calendar" },
  { href: "/legal/compliance", label: "Compliance Mapping" },
];

export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-4">
          <p className="text-xs uppercase tracking-[0.1em] text-slate-500">LEADOS · Part 53</p>
          <h1 className="mt-1 text-xl font-semibold text-slate-950">Contract &amp; Obligation Intelligence</h1>
          <nav className="mt-4 flex flex-wrap gap-2 text-sm">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-full border border-slate-300 px-3 py-1 text-slate-700 hover:border-slate-500 hover:text-slate-950"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-6">
        <div className="mb-6">
          <LegalDisclaimerBanner />
        </div>
        {children}
      </main>
    </div>
  );
}
