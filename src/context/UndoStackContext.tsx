"use client";

// Cross-cutting context #2: a single global undo stack. Mutations push an
// entry here instead of each feature inventing its own undo UI. This is
// intentionally generic (no "finding" or "notification" vocabulary) — the
// mutation hooks in src/lib/data/mutations/** are the domain-aware callers.
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

export interface UndoEntry {
  id: string;
  label: string;
  undo: () => Promise<void> | void;
  expiresAt: number;
}

interface UndoStackContextValue {
  entries: UndoEntry[];
  push: (label: string, undo: () => Promise<void> | void, ttlMs?: number) => string;
  consume: (id: string) => Promise<void>;
  dismiss: (id: string) => void;
}

const UndoStackContext = createContext<UndoStackContextValue | null>(null);

const DEFAULT_TTL_MS = 8000;

export function UndoStackProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<UndoEntry[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: string) => {
    setEntries((prev) => prev.filter((e) => e.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const push = useCallback(
    (label: string, undo: () => Promise<void> | void, ttlMs: number = DEFAULT_TTL_MS) => {
      const id = crypto.randomUUID();
      setEntries((prev) => [...prev, { id, label, undo, expiresAt: Date.now() + ttlMs }]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), ttlMs),
      );
      return id;
    },
    [dismiss],
  );

  const consume = useCallback(
    async (id: string) => {
      const entry = entries.find((e) => e.id === id);
      dismiss(id);
      if (entry) await entry.undo();
    },
    [entries, dismiss],
  );

  const value = useMemo(() => ({ entries, push, consume, dismiss }), [entries, push, consume, dismiss]);
  return <UndoStackContext.Provider value={value}>{children}</UndoStackContext.Provider>;
}

export function useUndoStack(): UndoStackContextValue {
  const ctx = useContext(UndoStackContext);
  if (!ctx) throw new Error("useUndoStack must be used within an UndoStackProvider");
  return ctx;
}
