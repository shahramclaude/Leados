"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";
import type { SemanticId } from "@/design/tokens";

export interface ToastInput {
  title: string;
  description?: string;
  tone?: SemanticId;
  durationMs?: number;
}

interface ToastRecord extends ToastInput {
  id: string;
}

interface ToastContextValue {
  push: (toast: ToastInput) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TONE_VARS: Record<SemanticId, { tint: string; ink: string }> = {
  success: { tint: "var(--success-tint)", ink: "var(--success-ink)" },
  warn: { tint: "var(--warn-tint)", ink: "var(--warn-ink)" },
  danger: { tint: "var(--danger-tint)", ink: "var(--danger-ink)" },
  info: { tint: "var(--info-tint)", ink: "var(--info-ink)" },
};

/**
 * ToastProvider — the ONE toast/notification system. Mount once near the
 * app root. Toasts are polite live-region announcements, auto-dismiss after
 * `durationMs` (default 6000ms, never under reduced-motion-sensitive timing
 * assumptions), and are also closable by keyboard.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (toast: ToastInput) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setToasts((prev) => [...prev, { ...toast, id }]);
      window.setTimeout(() => dismiss(id), toast.durationMs ?? 6000);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {typeof document !== "undefined" &&
        createPortal(
          <div className="fixed bottom-4 right-4 z-50 flex w-80 flex-col gap-2" role="region" aria-label="Notifications">
            {toasts.map((toast) => {
              const vars = TONE_VARS[toast.tone ?? "info"];
              return (
                <div
                  key={toast.id}
                  role="status"
                  aria-live="polite"
                  className={cn(
                    "flex items-start justify-between gap-3 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] p-3 shadow-[var(--elevation-3)]",
                  )}
                  style={{ backgroundColor: vars.tint, color: vars.ink }}
                >
                  <div>
                    <p className="text-[var(--text-sm)] font-semibold">{toast.title}</p>
                    {toast.description && <p className="mt-0.5 text-[var(--text-sm)] opacity-90">{toast.description}</p>}
                  </div>
                  <button
                    type="button"
                    onClick={() => dismiss(toast.id)}
                    aria-label="Dismiss notification"
                    className="shrink-0 rounded-[var(--radius-sm)] px-1 text-[var(--text-sm)] hover:opacity-70"
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>,
          document.body,
        )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
}
