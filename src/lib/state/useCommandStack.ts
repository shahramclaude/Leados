"use client";

import { useEffect, useSyncExternalStore } from "react";
import { globalCommandStack, type Command } from "./commandStack";

export function useCommandStack() {
  const snapshot = useSyncExternalStore(
    globalCommandStack.subscribe,
    globalCommandStack.getSnapshot,
    globalCommandStack.getSnapshot,
  );

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const meta = event.metaKey || event.ctrlKey;
      if (!meta) return;
      if (event.key.toLowerCase() === "z" && event.shiftKey) {
        event.preventDefault();
        void globalCommandStack.redo();
      } else if (event.key.toLowerCase() === "z") {
        event.preventDefault();
        void globalCommandStack.undo();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return {
    ...snapshot,
    run: (command: Command) => globalCommandStack.run(command),
    undo: () => globalCommandStack.undo(),
    redo: () => globalCommandStack.redo(),
  };
}
