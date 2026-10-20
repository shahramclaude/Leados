"use client";

import { useMemo, useState } from "react";

export type Command = { id: string; label: string; hint?: string; run: () => void };

/**
 * The actual palette UI/logic. This module is only fetched by the browser
 * the first time a user presses Cmd/Ctrl+K (see CommandPaletteLauncher),
 * keeping it out of the initial route bundle entirely.
 */
export function CommandPalette({ commands, onClose }: { commands: Command[]; onClose: () => void }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) => c.label.toLowerCase().includes(q));
  }, [commands, query]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 pt-24"
      onClick={onClose}
      role="dialog"
      aria-modal
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Type a command…"
          className="w-full border-b border-slate-100 px-4 py-3 text-sm outline-none"
        />
        <ul className="max-h-72 overflow-y-auto py-2">
          {filtered.length === 0 && <li className="px-4 py-2 text-sm text-slate-400">No matching commands</li>}
          {filtered.map((cmd) => (
            <li key={cmd.id}>
              <button
                onClick={() => {
                  cmd.run();
                  onClose();
                }}
                className="flex w-full items-center justify-between px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
              >
                <span>{cmd.label}</span>
                {cmd.hint && <span className="text-xs text-slate-400">{cmd.hint}</span>}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default CommandPalette;
