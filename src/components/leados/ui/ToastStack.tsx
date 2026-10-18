"use client";

export type ToastVariant = "info" | "success" | "warning" | "error";

export interface ToastItem {
  id: string;
  title: string;
  message?: string;
  variant?: ToastVariant;
}

export interface ToastStackProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}

const variantColor: Record<ToastVariant, string> = {
  info: "var(--accent-indigo)",
  success: "var(--sev2)",
  warning: "var(--sev3)",
  error: "var(--sev5)",
};

export default function ToastStack({ toasts, onDismiss }: ToastStackProps) {
  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-[200] flex w-80 flex-col gap-2.5">
      {toasts.map((toast) => {
        const variant = toast.variant ?? "info";
        const color = variantColor[variant];
        return (
          <div
            key={toast.id}
            className="pointer-events-auto animate-slide-in-right flex items-start gap-3 rounded-lg border p-3 shadow-lg"
            style={{
              backgroundColor: "var(--bg-overlay)",
              borderColor: "var(--border-default)",
              boxShadow: "var(--shadow-elevated)",
            }}
          >
            <span
              aria-hidden
              className="mt-1 h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: color, boxShadow: `0 0 0 3px color-mix(in srgb, ${color} 22%, transparent)` }}
            />
            <div className="min-w-0 flex-1">
              <p className="font-medium" style={{ color: "var(--text-primary)", fontSize: "var(--fs-sm)" }}>
                {toast.title}
              </p>
              {toast.message && (
                <p className="mt-0.5" style={{ color: "var(--text-secondary)", fontSize: "var(--fs-xs)" }}>
                  {toast.message}
                </p>
              )}
            </div>
            <button
              onClick={() => onDismiss(toast.id)}
              aria-label="Dismiss notification"
              className="shrink-0 rounded p-0.5 transition-colors focus-visible:outline-none"
              style={{ color: "var(--text-tertiary)" }}
            >
              <svg width="11" height="11" viewBox="0 0 14 14" fill="none">
                <path d="M1 1L13 13M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        );
      })}
    </div>
  );
}
