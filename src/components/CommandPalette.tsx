"use client";

// ---------------------------------------------------------------------------
// Every action in LEADOS is reachable here: navigation, object creation, and
// undo/redo. This is the keyboard-first spine of the app — focus management
// traps Tab inside the dialog and Escape always closes it.
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useUiStore, uiStore } from "@/lib/state/uiStore";
import { useCommandStack } from "@/lib/state/useCommandStack";

interface Action {
  id: string;
  label: string;
  hint?: string;
  run: () => void;
}

export function CommandPalette() {
  const { paletteOpen } = useUiStore();
  const router = useRouter();
  const { undo, redo, canUndo, canRedo } = useCommandStack();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const actions = useMemo<Action[]>(
    () => [
      { id: "nav-dashboard", label: "Go to Dashboard", hint: "G D", run: () => router.push("/dashboard") },
      { id: "nav-objectives", label: "Go to Objectives", hint: "G O", run: () => router.push("/objectives") },
      { id: "nav-approvals", label: "Go to Approvals", hint: "G A", run: () => router.push("/approvals") },
      { id: "nav-scenarios", label: "Go to Scenarios", run: () => router.push("/scenarios") },
      { id: "nav-audit", label: "Go to Audit log", run: () => router.push("/audit") },
      { id: "nav-settings", label: "Go to Settings", run: () => router.push("/settings") },
      { id: "new-objective", label: "Create new objective", hint: "N", run: () => router.push("/objectives?new=1") },
      {
        id: "undo",
        label: canUndo ? "Undo last action" : "Undo (nothing to undo)",
        hint: "⌘Z",
        run: () => void undo(),
      },
      {
        id: "redo",
        label: canRedo ? "Redo last undone action" : "Redo (nothing to redo)",
        hint: "⌘⇧Z",
        run: () => void redo(),
      },
      { id: "shortcuts", label: "Show keyboard shortcuts", hint: "?", run: () => uiStore.toggleShortcuts(true) },
      { id: "sync-drawer", label: "Open sync drawer", hint: "⌘⇧S", run: () => uiStore.toggleSyncDrawer(true) },
    ],
    [router, undo, redo, canUndo, canRedo],
  );

  const filtered = query.trim()
    ? actions.filter((a) => a.label.toLowerCase().includes(query.trim().toLowerCase()))
    : actions;

  useEffect(() => {
    if (paletteOpen) {
      setQuery("");
      setActiveIndex(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [paletteOpen]);

  useEffect(() => setActiveIndex(0), [query]);

  if (!paletteOpen) return null;

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      uiStore.togglePalette(false);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const action = filtered[activeIndex];
      if (action) {
        action.run();
        uiStore.togglePalette(false);
      }
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 px-4 pt-24">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onKeyDown={onKeyDown}
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Type a command or search…"
          aria-label="Command search"
          className="w-full border-b border-slate-200 px-4 py-3 text-sm outline-none focus-visible:bg-slate-50"
        />
        <ul className="max-h-80 overflow-y-auto py-2">
          {filtered.length === 0 && <li className="px-4 py-3 text-sm text-slate-500">No matching commands.</li>}
          {filtered.map((action, index) => (
            <li key={action.id}>
              <button
                onClick={() => {
                  action.run();
                  uiStore.togglePalette(false);
                }}
                onMouseEnter={() => setActiveIndex(index)}
                className={`flex w-full items-center justify-between px-4 py-2 text-left text-sm ${
                  index === activeIndex ? "bg-slate-900 text-white" : "text-slate-800"
                }`}
              >
                <span>{action.label}</span>
                {action.hint && (
                  <span className={`text-xs ${index === activeIndex ? "text-slate-300" : "text-slate-400"}`}>
                    {action.hint}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
