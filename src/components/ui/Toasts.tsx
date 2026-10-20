"use client";

import { useToast, type ToastVariant } from "@/context/ToastContext";

const VARIANT_CLASSES: Record<ToastVariant, string> = {
  success: "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100",
  error: "border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-100",
  info: "border-slate-300 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100",
};

export function Toasts() {
  const { toasts, dismiss } = useToast();
  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-full max-w-sm flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role={toast.variant === "error" ? "alert" : "status"}
          className={`pointer-events-auto flex items-start justify-between gap-3 rounded-lg border px-4 py-3 text-sm shadow-lg ${VARIANT_CLASSES[toast.variant]}`}
        >
          <span>{toast.message}</span>
          <div className="flex shrink-0 items-center gap-3">
            {toast.action ? (
              <button
                type="button"
                onClick={() => {
                  toast.action!.onClick();
                  dismiss(toast.id);
                }}
                className="font-semibold underline underline-offset-2"
              >
                {toast.action.label}
              </button>
            ) : null}
            <button type="button" aria-label="Dismiss" onClick={() => dismiss(toast.id)} className="opacity-60 hover:opacity-100">
              ✕
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
