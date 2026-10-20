"use client";

// Wires the undo stack into the command palette ("Undo last action", ⌘Z)
// without either module importing the other directly — keeps the two
// cross-cutting contexts decoupled.
import { useEffect } from "react";
import { useCommandPalette } from "@/context/CommandPaletteContext";
import { useUndoStack } from "@/context/UndoStackContext";

export function UndoCommandBridge() {
  const { register } = useCommandPalette();
  const { entries, consume } = useUndoStack();

  useEffect(() => {
    const last = entries[entries.length - 1];
    if (!last) return;
    return register({
      id: "undo-last-action",
      label: `Undo: ${last.label}`,
      hint: "⌘Z",
      run: () => void consume(last.id),
    });
  }, [entries, register, consume]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        const last = entries[entries.length - 1];
        if (last) {
          e.preventDefault();
          void consume(last.id);
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [entries, consume]);

  return null;
}
