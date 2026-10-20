"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { cx } from "./cx";
import { CONTROL_BASE, FieldShell, controlBorder } from "./FieldShell";

export interface ComboboxOption {
  value: string;
  label: string;
  description?: string;
}

export interface ComboboxProps {
  label?: string;
  hint?: string;
  error?: string;
  placeholder?: string;
  value: ComboboxOption | null;
  onChange: (option: ComboboxOption | null) => void;
  /** Static list, or an async loader keyed by query (debounced 180ms). */
  options?: ComboboxOption[];
  loadOptions?: (query: string) => Promise<ComboboxOption[]>;
  emptyMessage?: string;
}

/** ARIA 1.2 combobox pattern: input owns `aria-activedescendant`, the
 * listbox is a sibling popup, arrow keys move the active descendant, Enter
 * commits, Escape closes and restores the last committed label. */
export function Combobox({
  label,
  hint,
  error,
  placeholder = "Search…",
  value,
  onChange,
  options,
  loadOptions,
  emptyMessage = "No matches",
}: ComboboxProps) {
  const id = useId();
  const listboxId = `${id}-listbox`;
  const [query, setQuery] = useState(value?.label ?? "");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<ComboboxOption[]>(options ?? []);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setQuery(value?.label ?? "");
  }, [value]);

  useEffect(() => {
    if (!loadOptions) {
      const base = options ?? [];
      setResults(
        query ? base.filter((o) => o.label.toLowerCase().includes(query.toLowerCase())) : base,
      );
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await loadOptions(query);
        setResults(res);
      } finally {
        setLoading(false);
      }
    }, 180);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, loadOptions]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery(value?.label ?? "");
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [value]);

  const activeId = activeIndex >= 0 && results[activeIndex] ? `${id}-opt-${activeIndex}` : undefined;

  function commit(option: ComboboxOption) {
    onChange(option);
    setQuery(option.label);
    setOpen(false);
    setActiveIndex(-1);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      if (open && activeIndex >= 0 && results[activeIndex]) {
        e.preventDefault();
        commit(results[activeIndex]);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
      setQuery(value?.label ?? "");
    }
  }

  const describedId = useMemo(() => (hint ? `${id}-hint` : undefined), [hint, id]);

  return (
    <FieldShell label={label} hint={hint} error={error} htmlFor={id}>
      {() => (
        <div ref={containerRef} className="relative">
          <input
            id={id}
            role="combobox"
            aria-expanded={open}
            aria-controls={listboxId}
            aria-activedescendant={activeId}
            aria-autocomplete="list"
            aria-describedby={describedId}
            autoComplete="off"
            value={query}
            placeholder={placeholder}
            onFocus={() => setOpen(true)}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
              setActiveIndex(0);
            }}
            onKeyDown={onKeyDown}
            className={cx(CONTROL_BASE, controlBorder(Boolean(error)), "h-[var(--control-height-md)] px-[var(--space-3)] text-[var(--text-sm)]")}
          />
          {open && (
            <ul
              id={listboxId}
              role="listbox"
              aria-label={label ?? "Options"}
              className="leados-scroll absolute z-20 mt-[var(--space-1)] max-h-64 w-full overflow-auto rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-overlay)] py-[var(--space-1)] shadow-[var(--shadow-md)]"
            >
              {loading && <li className="px-[var(--space-3)] py-[var(--space-2)] text-[var(--text-xs)] text-[var(--text-muted)]">Searching…</li>}
              {!loading && results.length === 0 && (
                <li className="px-[var(--space-3)] py-[var(--space-2)] text-[var(--text-xs)] text-[var(--text-muted)]">{emptyMessage}</li>
              )}
              {!loading &&
                results.map((opt, i) => (
                  <li
                    id={`${id}-opt-${i}`}
                    key={opt.value}
                    role="option"
                    aria-selected={i === activeIndex}
                    onMouseEnter={() => setActiveIndex(i)}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      commit(opt);
                    }}
                    className={cx(
                      "cursor-pointer px-[var(--space-3)] py-[var(--space-2)] text-[var(--text-sm)]",
                      i === activeIndex ? "bg-[var(--accent-subtle)] text-[var(--accent-default)]" : "text-[var(--text-primary)]",
                    )}
                  >
                    <div>{opt.label}</div>
                    {opt.description && <div className="text-[var(--text-xs)] text-[var(--text-muted)]">{opt.description}</div>}
                  </li>
                ))}
            </ul>
          )}
        </div>
      )}
    </FieldShell>
  );
}
