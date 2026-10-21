"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ROUTES } from "@/lib/client-session";

/**
 * Keyboard-first command palette: Cmd/Ctrl+K opens it, typing filters the
 * route list, ArrowUp/ArrowDown move selection, Enter navigates, Escape
 * closes. The whole app is reachable without ever touching a mouse — this is
 * the "command-palette-only navigation" golden journey.
 */
export default function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ROUTES;
    return ROUTES.filter(
      (r) => r.label.toLowerCase().includes(q) || r.keywords.toLowerCase().includes(q),
    );
  }, [query]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const isToggle = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
      if (isToggle) {
        event.preventDefault();
        setOpen((prev) => !prev);
        return;
      }
      if (event.key === "Escape" && open) {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  function navigate(index: number) {
    const target = results[index];
    if (!target) return;
    setOpen(false);
    router.push(target.href);
  }

  function onInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      navigate(activeIndex);
    }
  }

  return (
    <>
      <button
        type="button"
        data-testid="command-palette-trigger"
        onClick={() => setOpen(true)}
        className="rounded-full border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
      >
        ⌘K Go to…
      </button>
      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Command palette"
          data-testid="command-palette"
          className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/40 px-4 pt-24"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-2xl bg-white p-3 shadow-2xl dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <input
              ref={inputRef}
              data-testid="command-palette-input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onInputKeyDown}
              placeholder="Type a page name and press Enter…"
              aria-label="Search pages"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
            <ul role="listbox" aria-label="Pages" className="mt-2 max-h-72 overflow-auto">
              {results.map((r, i) => (
                <li key={r.href}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={i === activeIndex}
                    data-testid={`command-palette-option-${r.href}`}
                    onMouseEnter={() => setActiveIndex(i)}
                    onClick={() => navigate(i)}
                    className={`block w-full rounded-lg px-3 py-2 text-left text-sm ${
                      i === activeIndex
                        ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                        : "text-slate-700 dark:text-slate-200"
                    }`}
                  >
                    {r.label}
                  </button>
                </li>
              ))}
              {results.length === 0 ? (
                <li className="px-3 py-2 text-sm text-slate-500">No pages match.</li>
              ) : null}
            </ul>
          </div>
        </div>
      ) : null}
    </>
  );
}
