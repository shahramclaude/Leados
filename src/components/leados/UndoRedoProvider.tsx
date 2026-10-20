"use client";

import { useEffect, type ReactNode } from "react";
import { UndoRedoContext, useUndoRedoStack } from "./useUndoRedo";

export function UndoRedoProvider({ children }: { children: ReactNode }) {
  const stack = useUndoRedoStack();

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const isEditable = ["INPUT", "TEXTAREA"].includes(target.tagName) || target.isContentEditable;
      if (isEditable) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        void stack.undo();
      } else if (mod && (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey))) {
        e.preventDefault();
        void stack.redo();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [stack]);

  return <UndoRedoContext.Provider value={stack}>{children}</UndoRedoContext.Provider>;
}
