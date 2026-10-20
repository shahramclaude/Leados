"use client";

import { useEffect, useRef } from "react";

const SHORTCUTS: { keys: string; description: string }[] = [
  { keys: "⌘K / Ctrl+K", description: "Open command palette (routes, search, commands)" },
  { keys: "?", description: "Open this shortcuts overlay" },
  { keys: "Esc", description: "Close any dialog, drawer, popover or the palette" },
  { keys: "↑ / ↓", description: "Move selection in lists, menus and the command palette" },
  { keys: "← / →", description: "Move focus between tabs" },
  { keys: "Enter", description: "Activate the focused row, option or menu item" },
  { keys: "Tab / Shift+Tab", description: "Move focus; trapped inside open modals and drawers" },
  { keys: "⌘Z / Ctrl+Z", description: "Undo the last reversible action" },
  { keys: "⌘⇧Z / Ctrl+Y", description: "Redo" },
];

export function ShortcutsOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    containerRef.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-[var(--radius-lg)] border border-border-subtle bg-surface-overlay p-6 shadow-[var(--elevation-3)]"
      >
        <h2 className="text-base font-semibold text-text-primary">Keyboard shortcuts</h2>
        <dl className="mt-4 flex flex-col gap-3">
          {SHORTCUTS.map((shortcut) => (
            <div key={shortcut.keys} className="flex items-center justify-between gap-4 text-sm">
              <dt className="text-text-secondary">{shortcut.description}</dt>
              <dd className="shrink-0 rounded border border-border-subtle bg-surface-sunken px-2 py-0.5 font-mono text-xs text-text-primary">
                {shortcut.keys}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
