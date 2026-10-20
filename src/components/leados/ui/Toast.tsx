"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

export type ToastTone = "info" | "success" | "danger" | "warning";

export interface ToastOptions {
  title: string;
  description?: string;
  tone?: ToastTone;
  /** "assertive" interrupts the screen reader immediately; use sparingly for critical errors. */
  politeness?: "polite" | "assertive";
  actionLabel?: string;
  onAction?: () => void;
}

interface ToastRecord extends ToastOptions {
  id: number;
}

interface ToastContextValue {
  notify: (options: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TONE_CLASS: Record<ToastTone, string> = {
  info: "border-status-info",
  success: "border-status-success",
  danger: "border-status-danger",
  warning: "border-status-warning",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [polite, setPolite] = useState<ToastRecord[]>([]);
  const [assertive, setAssertive] = useState<ToastRecord[]>([]);
  const idRef = useRef(0);

  const notify = useCallback((options: ToastOptions) => {
    const id = ++idRef.current;
    const record: ToastRecord = { id, politeness: "polite", tone: "info", ...options };
    if (record.politeness === "assertive") {
      setAssertive((prev) => [...prev, record]);
    } else {
      setPolite((prev) => [...prev, record]);
    }
    window.setTimeout(() => {
      setPolite((prev) => prev.filter((t) => t.id !== id));
      setAssertive((prev) => prev.filter((t) => t.id !== id));
    }, 6000);
  }, []);

  const value = useMemo(() => ({ notify }), [notify]);

  function renderToast(toast: ToastRecord) {
    return (
      <div
        key={toast.id}
        className={[
          "pointer-events-auto w-80 rounded-[var(--radius-md)] border-l-4 bg-surface-overlay p-3 shadow-[var(--elevation-3)]",
          "animate-[leados-fade-in_var(--duration-base)_var(--ease-entrance)]",
          TONE_CLASS[toast.tone ?? "info"],
        ].join(" ")}
      >
        <p className="text-sm font-semibold text-text-primary">{toast.title}</p>
        {toast.description ? <p className="mt-0.5 text-xs text-text-secondary">{toast.description}</p> : null}
        {toast.actionLabel && toast.onAction ? (
          <button
            type="button"
            onClick={toast.onAction}
            className="mt-2 text-xs font-medium text-accent-default underline-offset-2 hover:underline"
          >
            {toast.actionLabel}
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[200] flex flex-col gap-2">
        <div aria-live="polite" aria-atomic="true" className="flex flex-col gap-2">
          {polite.map(renderToast)}
        </div>
        <div aria-live="assertive" aria-atomic="true" className="flex flex-col gap-2">
          {assertive.map(renderToast)}
        </div>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
