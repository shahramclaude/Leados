"use client";

import { useEffect, useMemo, useState } from "react";
import { useCommandPalette } from "@/context/CommandPaletteContext";

export function CommandPalette() {
  const { open, setOpen, commands } = useCommandPalette();
  const [query, setQuery] = useState("");

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(!open);
      }
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, setOpen]);

  const filtered = useMemo(
    () => commands.filter((c) => c.label.toLowerCase().includes(query.toLowerCase())),
    [commands, query],
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/40 pt-24" onClick={() => setOpen(false)}>
      <div
        role="dialog"
        aria-label="Command palette"
        className="w-full max-w-lg overflow-hidden rounded-xl bg-white shadow-2xl dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Type a command…"
          className="w-full border-b border-slate-200 px-4 py-3 text-sm outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
        />
        <ul className="max-h-80 overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <li className="px-4 py-3 text-sm text-slate-500">No matching commands.</li>
          ) : (
            filtered.map((cmd) => (
              <li key={cmd.id}>
                <button
                  type="button"
                  onClick={() => {
                    cmd.run();
                    setOpen(false);
                    setQuery("");
                  }}
                  className="flex w-full items-center justify-between px-4 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <span className="text-slate-900 dark:text-slate-100">{cmd.label}</span>
                  {cmd.hint ? <span className="text-xs text-slate-400">{cmd.hint}</span> : null}
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
