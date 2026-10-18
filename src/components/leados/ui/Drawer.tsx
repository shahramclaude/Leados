"use client";

import { useEffect, type ReactNode } from "react";

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  width?: "40%" | "50%" | "60%";
  children?: ReactNode;
}

export default function Drawer({ open, onClose, title, subtitle, width = "40%", children }: DrawerProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  return (
    <div
      className="fixed inset-0 z-50"
      aria-hidden={!open}
      style={{ pointerEvents: open ? "auto" : "none" }}
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="absolute inset-0 transition-opacity duration-200"
        style={{
          backgroundColor: "rgba(4, 6, 12, 0.6)",
          backdropFilter: open ? "blur(4px)" : "none",
          opacity: open ? 1 : 0,
        }}
      />
      {/* Panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="absolute right-0 top-0 flex h-full flex-col border-l shadow-2xl transition-transform duration-250 ease-out"
        style={{
          width,
          minWidth: 320,
          maxWidth: "92vw",
          backgroundColor: "var(--bg-overlay)",
          borderColor: "var(--border-default)",
          boxShadow: "var(--shadow-overlay)",
          transform: open ? "translateX(0)" : "translateX(100%)",
        }}
      >
        {(title || subtitle) && (
          <header
            className="flex shrink-0 items-start justify-between gap-3 border-b px-5 py-4"
            style={{ borderColor: "var(--border-subtle)" }}
          >
            <div className="min-w-0">
              {title && (
                <h2 className="truncate font-semibold" style={{ color: "var(--text-primary)", fontSize: "var(--fs-lg)" }}>
                  {title}
                </h2>
              )}
              {subtitle && (
                <p className="mt-1 truncate" style={{ color: "var(--text-secondary)", fontSize: "var(--fs-sm)" }}>
                  {subtitle}
                </p>
              )}
            </div>
            <button
              onClick={onClose}
              aria-label="Close drawer"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border transition-colors focus-visible:outline-none"
              style={{ borderColor: "var(--border-default)", color: "var(--text-secondary)" }}
            >
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                <path d="M1 1L13 13M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </header>
        )}
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
