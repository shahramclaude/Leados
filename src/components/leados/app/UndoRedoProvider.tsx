"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

export interface ReversibleAction {
  label: string;
  undo: () => void | Promise<void>;
  redo: () => void | Promise<void>;
}

interface UndoRedoContextValue {
  canUndo: boolean;
  canRedo: boolean;
  lastLabel?: string;
  push: (action: ReversibleAction) => void;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
}

const UndoRedoContext = createContext<UndoRedoContextValue | null>(null);

/**
 * Generic reversible-mutation stack for the UI layer. Feature code calls
 * `push()` after an optimistic mutation; Part 07's server-side compensations
 * can subscribe the same `undo`/`redo` callbacks to real API calls later.
 */
export function UndoRedoProvider({ children }: { children: ReactNode }) {
  const [undoStack, setUndoStack] = useState<ReversibleAction[]>([]);
  const [redoStack, setRedoStack] = useState<ReversibleAction[]>([]);

  const push = useCallback((action: ReversibleAction) => {
    setUndoStack((prev) => [...prev, action]);
    setRedoStack([]);
  }, []);

  const undo = useCallback(async () => {
    setUndoStack((prev) => {
      if (prev.length === 0) return prev;
      const next = prev.slice(0, -1);
      const action = prev[prev.length - 1];
      void action.undo();
      setRedoStack((redo) => [...redo, action]);
      return next;
    });
  }, []);

  const redo = useCallback(async () => {
    setRedoStack((prev) => {
      if (prev.length === 0) return prev;
      const next = prev.slice(0, -1);
      const action = prev[prev.length - 1];
      void action.redo();
      setUndoStack((undoS) => [...undoS, action]);
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({
      canUndo: undoStack.length > 0,
      canRedo: redoStack.length > 0,
      lastLabel: undoStack[undoStack.length - 1]?.label,
      push,
      undo,
      redo,
    }),
    [undoStack, redoStack, push, undo, redo],
  );

  return <UndoRedoContext.Provider value={value}>{children}</UndoRedoContext.Provider>;
}

export function useUndoRedo(): UndoRedoContextValue {
  const ctx = useContext(UndoRedoContext);
  if (!ctx) throw new Error("useUndoRedo must be used within UndoRedoProvider");
  return ctx;
}
