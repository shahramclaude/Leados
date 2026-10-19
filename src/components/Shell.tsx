"use client";

import { useEffect, useState, type ReactNode } from "react";
import { NavBar } from "@/components/NavBar";
import { CommandPalette } from "@/components/CommandPalette";

export function Shell({ children }: { children: ReactNode }) {
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="flex min-h-screen">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <NavBar onOpenPalette={() => setPaletteOpen(true)} />
      <main id="main-content" tabIndex={-1} className="min-w-0 flex-1 bg-surface px-4 py-6 focus:outline-none sm:px-6 lg:px-10 lg:py-8">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">{children}</div>
      </main>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
