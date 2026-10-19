import { useEffect, useRef, useState } from "react";
import { PALETTE_ROUTES, type RouteKey } from "./routes";

// ─────────────────────────────────────────────────────────────
// CommandPalette — ⌘K style route switcher. Opened from the nav
// rail's ⌘ icon or Cmd/Ctrl+K anywhere in the app.
// ─────────────────────────────────────────────────────────────
export function CommandPalette({
  open,
  onClose,
  onNavigate,
}: {
  open: boolean;
  onClose: () => void;
  onNavigate: (route: RouteKey) => void;
}) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!open) return null;

  const filtered = PALETTE_ROUTES.filter(
    (r) => r.hint.toLowerCase().includes(query.toLowerCase()) || r.key.includes(query.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center bg-black/60 pt-[14vh]" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-lg border border-[color:var(--border-default)] bg-[color:var(--bg-panel)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-[color:var(--border-subtle)] px-3 py-2">
          <span className="font-mono text-[color:var(--text-accent)]">⌘</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Jump to module…"
            className="w-full bg-transparent font-mono text-sm text-[color:var(--text-primary)] outline-none placeholder:text-[color:var(--text-muted)]"
          />
          <kbd className="rounded border border-[color:var(--border-default)] px-1 font-mono text-[9px] text-[color:var(--text-muted)]">
            ESC
          </kbd>
        </div>
        <div className="max-h-80 overflow-y-auto p-1">
          {filtered.map((r) => (
            <button
              key={r.key}
              onClick={() => {
                onNavigate(r.key);
                onClose();
              }}
              className="flex w-full items-center gap-3 rounded px-3 py-2 text-left font-mono text-sm text-[color:var(--text-secondary)] hover:bg-[color:var(--bg-elevated)] hover:text-[color:var(--text-primary)]"
            >
              <span className="w-5 text-center text-[color:var(--text-accent)]">{r.glyph}</span>
              {r.hint}
              <span className="ml-auto text-[10px] text-[color:var(--text-muted)]">#{r.key}</span>
            </button>
          ))}
          {!filtered.length && (
            <div className="px-3 py-6 text-center font-mono text-xs text-[color:var(--text-muted)]">
              No module matches "{query}"
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
