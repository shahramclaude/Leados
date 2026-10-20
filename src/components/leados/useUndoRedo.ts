"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";

export interface ReversibleAction {
  id: string;
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
 * In-memory undo/redo stack for reversible UI mutations. This is the UI
 * layer wiring the brief asked for; it intentionally stops at the browser
 * tab boundary — Part 07's server-side compensations are expected to hang
 * their `undo`/`redo` implementations off the same `ReversibleAction`
 * shape rather than requiring a second stack.
 */
export function useUndoRedoStack(): UndoRedoContextValue {
  const [past, setPast] = useState<ReversibleAction[]>([]);
  const [future, setFuture] = useState<ReversibleAction[]>([]);
  const busy = useRef(false);

  const push = useCallback((action: ReversibleAction) => {
    setPast((p) => [...p, action]);
    setFuture([]);
  }, []);

  const undo = useCallback(async () => {
    if (busy.current) return;
    setPast((p) => {
      if (p.length === 0) return p;
      const action = p[p.length - 1];
      busy.current = true;
      Promise.resolve(action.undo()).finally(() => {
        busy.current = false;
      });
      setFuture((f) => [action, ...f]);
      return p.slice(0, -1);
    });
  }, []);

  const redo = useCallback(async () => {
    if (busy.current) return;
    setFuture((f) => {
      if (f.length === 0) return f;
      const action = f[0];
      busy.current = true;
      Promise.resolve(action.redo()).finally(() => {
        busy.current = false;
      });
      setPast((p) => [...p, action]);
      return f.slice(1);
    });
  }, []);

  return useMemo(
    () => ({ canUndo: past.length > 0, canRedo: future.length > 0, lastLabel: past[past.length - 1]?.label, push, undo, redo }),
    [past, future, push, undo, redo],
  );
}

export { UndoRedoContext };

export function useUndoRedo(): UndoRedoContextValue {
  const ctx = useContext(UndoRedoContext);
  if (!ctx) throw new Error("useUndoRedo must be used within UndoRedoProvider");
  return ctx;
}
