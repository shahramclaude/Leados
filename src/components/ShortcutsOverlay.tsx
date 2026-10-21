"use client";

import { useUiStore, uiStore } from "@/lib/state/uiStore";
import { SHORTCUTS } from "@/lib/shortcuts";

export function ShortcutsOverlay() {
  const { shortcutsOpen } = useUiStore();
  if (!shortcutsOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4"
      onKeyDown={(e) => e.key === "Escape" && uiStore.toggleShortcuts(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Keyboard shortcuts</h2>
          <button
            onClick={() => uiStore.toggleShortcuts(false)}
            autoFocus
            className="rounded-md px-2 py-1 text-sm text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
          >
            Close (Esc)
          </button>
        </div>
        <dl className="mt-4 space-y-2">
          {SHORTCUTS.map((s) => (
            <div key={s.id} className="flex items-center justify-between text-sm">
              <dt className="text-slate-600">{s.description}</dt>
              <dd className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-800">{s.keys}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
