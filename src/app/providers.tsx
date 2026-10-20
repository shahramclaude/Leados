"use client";

// Single composition root for every cross-cutting client provider. Per
// docs/FRONTEND.md, a global context may only hold session/toasts/command
// palette — this file is where that rule is enforced structurally: it is
// the ONLY place `*Provider` components are nested, and every provider here
// is domain-agnostic.
import type { ReactNode } from "react";
import { DataProvider } from "@/lib/data/queryClient";
import { ToastProvider } from "@/context/ToastContext";
import { UndoStackProvider } from "@/context/UndoStackContext";
import { CommandPaletteProvider } from "@/context/CommandPaletteContext";
import { Toasts } from "@/components/ui/Toasts";
import { CommandPalette } from "@/components/ui/CommandPalette";
import { UndoCommandBridge } from "@/components/ui/UndoCommandBridge";
import { OfflineBanner } from "@/components/ui/OfflineBanner";
import { ThemeApplier } from "@/components/ui/ThemeApplier";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <DataProvider>
      <ToastProvider>
        <UndoStackProvider>
          <CommandPaletteProvider>
            <ThemeApplier />
            <OfflineBanner />
            {children}
            <Toasts />
            <CommandPalette />
            <UndoCommandBridge />
          </CommandPaletteProvider>
        </UndoStackProvider>
      </ToastProvider>
    </DataProvider>
  );
}
