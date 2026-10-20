import type { ReactNode } from "react";
import { NavBar } from "./NavBar";
import { TopBar } from "./TopBar";

export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen w-full overflow-hidden bg-[var(--surface-base)]">
      <NavBar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main id="main-content" tabIndex={-1} className="leados-scroll flex-1 overflow-y-auto px-[var(--space-6)] py-[var(--space-6)]">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-[var(--space-6)]">{children}</div>
        </main>
      </div>
    </div>
  );
}
