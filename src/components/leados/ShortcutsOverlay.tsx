"use client";

import { useEffect, useState } from "react";

const SHORTCUTS: { keys: string; description: string }[] = [
  { keys: "⌘K / Ctrl K", description: "Open the command palette" },
  { keys: "⌘Z / Ctrl Z", description: "Undo the last reversible change" },
  { keys: "⌘⇧Z / Ctrl Y", description: "Redo" },
  { keys: "↑ / ↓", description: "Move selection in lists, tables, and menus" },
  { keys: "← / →", description: "Move between tabs" },
  { keys: "Enter", description: "Activate the focused row or option" },
  { keys: "Esc", description: "Close the open dialog, drawer, or menu" },
  { keys: "?", description: "Toggle this shortcuts overlay" },
];

/** Global "?" overlay. Ignores the key while focus is inside a text input
 * so typing a literal "?" in a field doesn't pop the dialog. */
export function ShortcutsOverlay() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const isEditable = ["INPUT", "TEXTAREA"].includes(target.tagName) || target.isContentEditable;
      if (e.key === "?" && !isEditable) {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape" && open) {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-title"
        className="relative w-full max-w-md rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-overlay)] p-[var(--space-5)] shadow-[var(--shadow-lg)]"
      >
        <h2 id="shortcuts-title" className="text-[var(--text-md)] font-semibold text-[var(--text-primary)]">
          Keyboard shortcuts
        </h2>
        <dl className="mt-[var(--space-3)] flex flex-col gap-[var(--space-2)]">
          {SHORTCUTS.map((s) => (
            <div key={s.keys} className="flex items-center justify-between gap-[var(--space-3)] text-[var(--text-sm)]">
              <dt className="text-[var(--text-secondary)]">{s.description}</dt>
              <dd className="font-mono-nums rounded-[var(--radius-sm)] border border-[var(--border-subtle)] px-[var(--space-2)] py-0.5 text-[var(--text-xs)] text-[var(--text-primary)]">
                {s.keys}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
