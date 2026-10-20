"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { CommandPalette } from "@/components/leados/nav/CommandPalette";
import { ShortcutsOverlay } from "@/components/leados/app/ShortcutsOverlay";
import { useUndoRedo } from "@/components/leados/app/UndoRedoProvider";
import { useToast } from "@/components/leados/ui/Toast";

interface ChromeContextValue {
  openPalette: () => void;
  openShortcuts: () => void;
}

const ChromeContext = createContext<ChromeContextValue | null>(null);

export function useChrome(): ChromeContextValue {
  const ctx = useContext(ChromeContext);
  if (!ctx) throw new Error("useChrome must be used within GlobalChrome");
  return ctx;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || target.isContentEditable || tag === "select";
}

/**
 * Mounted once in the root layout: owns the command palette and the "?"
 * shortcuts overlay so both work identically on every route, plus wires
 * global undo/redo keyboard shortcuts to the UndoRedoProvider stack.
 */
export function GlobalChrome({ children }: { children: ReactNode }) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const { undo, redo, canUndo, canRedo, lastLabel } = useUndoRedo();
  const { notify } = useToast();

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const meta = event.metaKey || event.ctrlKey;
      if (meta && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((v) => !v);
        return;
      }
      if (event.key === "?" && !isTypingTarget(event.target) && !paletteOpen) {
        event.preventDefault();
        setShortcutsOpen(true);
        return;
      }
      if (meta && event.key.toLowerCase() === "z" && !isTypingTarget(event.target)) {
        event.preventDefault();
        if (event.shiftKey) {
          if (canRedo) void redo();
        } else if (canUndo) {
          void undo().then(() => notify({ title: "Undone", description: lastLabel, tone: "info" }));
        }
        return;
      }
      if (meta && event.key.toLowerCase() === "y" && !isTypingTarget(event.target)) {
        event.preventDefault();
        if (canRedo) void redo();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [paletteOpen, canUndo, canRedo, undo, redo, lastLabel, notify]);

  return (
    <ChromeContext.Provider value={{ openPalette: () => setPaletteOpen(true), openShortcuts: () => setShortcutsOpen(true) }}>
      <a href="#leados-main" className="skip-link">
        Skip to main content
      </a>
      {children}
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <ShortcutsOverlay open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    </ChromeContext.Provider>
  );
}
