"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { cx } from "./cx";

export type ToastTone = "neutral" | "success" | "warning" | "danger";

export interface ToastInput {
  title: string;
  description?: string;
  tone?: ToastTone;
  /** polite = announced when the screen reader is idle; assertive =
   * interrupts immediately. Use assertive sparingly (errors only). */
  politeness?: "polite" | "assertive";
  durationMs?: number;
  action?: { label: string; onClick: () => void };
}

interface ToastRecord extends ToastInput {
  id: string;
}

interface ToastContextValue {
  push: (toast: ToastInput) => string;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TONE_CLASS: Record<ToastTone, string> = {
  neutral: "border-[var(--border-subtle)]",
  success: "border-[var(--status-success)]",
  warning: "border-[var(--status-warning)]",
  danger: "border-[var(--status-danger)]",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const counter = useRef(0);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (toast: ToastInput) => {
      const id = `toast-${++counter.current}`;
      setToasts((prev) => [...prev, { ...toast, id }]);
      const duration = toast.durationMs ?? 5000;
      if (duration > 0) {
        setTimeout(() => dismiss(id), duration);
      }
      return id;
    },
    [dismiss],
  );

  const value = useMemo(() => ({ push, dismiss }), [push, dismiss]);
  const polite = toasts.filter((t) => (t.politeness ?? "polite") === "polite");
  const assertive = toasts.filter((t) => t.politeness === "assertive");

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-[var(--space-4)] right-[var(--space-4)] z-[60] flex w-80 flex-col gap-[var(--space-2)]">
        <div aria-live="polite" aria-atomic="false" className="flex flex-col gap-[var(--space-2)]">
          {polite.map((t) => (
            <ToastCard key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
          ))}
        </div>
        <div aria-live="assertive" aria-atomic="false" className="flex flex-col gap-[var(--space-2)]">
          {assertive.map((t) => (
            <ToastCard key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
          ))}
        </div>
      </div>
    </ToastContext.Provider>
  );
}

function ToastCard({ toast, onDismiss }: { toast: ToastRecord; onDismiss: () => void }) {
  return (
    <div
      role="status"
      className={cx(
        "pointer-events-auto rounded-[var(--radius-md)] border-l-4 bg-[var(--surface-overlay)] p-[var(--space-3)] shadow-[var(--shadow-lg)]",
        "animate-[leados-fade-in_var(--duration-base)_var(--ease-decelerate)]",
        TONE_CLASS[toast.tone ?? "neutral"],
      )}
    >
      <div className="flex items-start justify-between gap-[var(--space-2)]">
        <div>
          <p className="text-[var(--text-sm)] font-semibold text-[var(--text-primary)]">{toast.title}</p>
          {toast.description && <p className="mt-0.5 text-[var(--text-xs)] text-[var(--text-muted)]">{toast.description}</p>}
          {toast.action && (
            <button
              type="button"
              onClick={toast.action.onClick}
              className="mt-[var(--space-2)] text-[var(--text-xs)] font-medium text-[var(--accent-default)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
            >
              {toast.action.label}
            </button>
          )}
        </div>
        <button
          type="button"
          aria-label="Dismiss notification"
          onClick={onDismiss}
          className="text-[var(--text-muted)] hover:text-[var(--text-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
