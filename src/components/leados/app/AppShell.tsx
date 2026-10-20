import type { ReactNode } from "react";
import { NavBar } from "@/components/leados/nav/NavBar";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-surface-sunken">
      <NavBar />
      <main id="leados-main" className="mx-auto max-w-[1400px] px-[var(--comp-page-gutter)] py-6">
        {children}
      </main>
    </div>
  );
}
