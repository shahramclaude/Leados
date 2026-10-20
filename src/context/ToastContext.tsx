"use client";

// Cross-cutting context #1 of 3 allowed by docs/FRONTEND.md's state taxonomy
// (session, toasts, command palette). Nothing here has a domain name —
// callers pass whatever message/variant they want.
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

export type ToastVariant = "success" | "error" | "info";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastItem {
  id: string;
  message: string;
  variant: ToastVariant;
  action?: ToastAction;
  durationMs: number;
}

interface ToastContextValue {
  toasts: ToastItem[];
  show: (message: string, variant?: ToastVariant, opts?: { action?: ToastAction; durationMs?: number }) => string;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const show = useCallback(
    (message: string, variant: ToastVariant = "info", opts?: { action?: ToastAction; durationMs?: number }) => {
      const id = crypto.randomUUID();
      const durationMs = opts?.durationMs ?? (variant === "error" ? 6000 : 4000);
      setToasts((prev) => [...prev, { id, message, variant, action: opts?.action, durationMs }]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), durationMs),
      );
      return id;
    },
    [dismiss],
  );

  const value = useMemo(() => ({ toasts, show, dismiss }), [toasts, show, dismiss]);
  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within a ToastProvider");
  return ctx;
}
