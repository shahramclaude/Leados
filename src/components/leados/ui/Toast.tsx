"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { cn } from "./utils";
import type { Severity } from "./tokens";

export type ToastTone = Extract<Severity, "critical" | "warning" | "good" | "info">;

export type ToastInput = {
  title: string;
  description?: string;
  tone?: ToastTone;
  durationMs?: number;
};

type ToastRecord = ToastInput & { id: string };

type ToastContextValue = {
  push: (toast: ToastInput) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const toneClasses: Record<ToastTone, string> = {
  critical: "border-severity-critical/40 [&_[data-icon]]:text-severity-critical",
  warning: "border-severity-warning/40 [&_[data-icon]]:text-severity-warning",
  good: "border-severity-good/40 [&_[data-icon]]:text-severity-good",
  info: "border-severity-info/40 [&_[data-icon]]:text-severity-info",
};

const toneIcon: Record<ToastTone, string> = {
  critical: "⛔",
  warning: "⚠️",
  good: "✅",
  info: "ℹ️",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (toast: ToastInput) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setToasts((prev) => [...prev, { ...toast, id }]);
      const duration = toast.durationMs ?? 5000;
      if (duration > 0) {
        setTimeout(() => dismiss(id), duration);
      }
    },
    [dismiss],
  );

  const value = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* Single polite live region: async state changes (saves, orchestration runs, errors) are
          announced to screen reader users without stealing focus. */}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed bottom-4 right-4 z-[90] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="status"
            className={cn(
              "leados-stagger pointer-events-auto flex items-start gap-3 rounded-lg border bg-surface-overlay p-3.5 shadow-lg",
              "transition-all duration-[var(--motion-slow)] ease-[var(--ease-decelerate)]",
              toneClasses[toast.tone ?? "info"],
            )}
          >
            <span aria-hidden="true" data-icon className="mt-0.5 text-base leading-none">
              {toneIcon[toast.tone ?? "info"]}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-body-sm font-semibold text-text-primary">{toast.title}</p>
              {toast.description ? (
                <p className="mt-0.5 text-body-sm text-text-secondary">{toast.description}</p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              aria-label="Dismiss notification"
              className="shrink-0 rounded-md p-1 text-text-tertiary transition-colors hover:bg-surface-raised hover:text-text-primary"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within a ToastProvider");
  return ctx;
}
