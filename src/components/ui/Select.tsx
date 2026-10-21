"use client";

import { useId, useMemo, useRef, useState, useEffect } from "react";
import { cn } from "@/lib/cn";
import { announce } from "@/lib/a11y";

export interface SelectOption {
  value: string;
  label: string;
  description?: string;
}

export interface SelectProps {
  label: string;
  hideLabel?: boolean;
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  error?: string;
  /** Enables type-ahead filtering inside an ARIA listbox popover. When
   * false, renders a plain native <select> (cheaper, equally accessible for
   * short lists). This is the ONE dropdown primitive in the system — do not
   * add a second combobox implementation; extend this one. */
  searchable?: boolean;
  className?: string;
}

/**
 * Select — the single dropdown/listbox implementation for LEADOS.
 * States: default / hover / focus-visible / disabled / open / filtered-empty.
 */
export function Select({
  label,
  hideLabel,
  options,
  value,
  onChange,
  placeholder = "Select…",
  disabled,
  error,
  searchable = false,
  className,
}: SelectProps) {
  const id = useId();
  const selected = options.find((o) => o.value === value);

  if (!searchable) {
    return (
      <div className="flex flex-col gap-1.5">
        <label htmlFor={id} className={cn("text-[var(--text-sm)] font-medium text-[var(--text-secondary)]", hideLabel && "visually-hidden")}>
          {label}
        </label>
        <select
          id={id}
          disabled={disabled}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={Boolean(error) || undefined}
          className={cn(
            "h-10 rounded-[var(--radius-md)] border bg-[var(--surface-1)] px-3 text-[var(--text-base)] text-[var(--text-primary)]",
            "transition-colors duration-[var(--motion-fast)] ease-[var(--motion-ease-standard)]",
            "disabled:opacity-50 disabled:pointer-events-none",
            error ? "border-[var(--danger-solid)]" : "border-[var(--border-default)] hover:border-[var(--border-strong)]",
            className,
          )}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <SearchableSelect
      id={id}
      label={label}
      hideLabel={hideLabel}
      options={options}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      disabled={disabled}
      className={className}
    />
  );
}

function SearchableSelect({
  id,
  label,
  hideLabel,
  options,
  value,
  onChange,
  placeholder,
  disabled,
  className,
}: {
  id: string;
  label: string;
  hideLabel?: boolean;
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);

  const filtered = useMemo(
    () => options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase())),
    [options, query],
  );

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function commit(opt: SelectOption) {
    onChange(opt.value);
    announce(`${label}: ${opt.label} selected`);
    setOpen(false);
    setQuery("");
  }

  return (
    <div className="relative flex flex-col gap-1.5" ref={rootRef}>
      <label htmlFor={id} className={cn("text-[var(--text-sm)] font-medium text-[var(--text-secondary)]", hideLabel && "visually-hidden")}>
        {label}
      </label>
      <button
        type="button"
        id={id}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex h-10 items-center justify-between rounded-[var(--radius-md)] border bg-[var(--surface-1)] px-3 text-left text-[var(--text-base)] text-[var(--text-primary)]",
          "border-[var(--border-default)] hover:border-[var(--border-strong)] disabled:opacity-50 disabled:pointer-events-none",
          className,
        )}
      >
        <span className={selected ? "" : "text-[var(--text-disabled)]"}>{selected ? selected.label : placeholder}</span>
        <span aria-hidden className="text-[var(--text-muted)]">▾</span>
      </button>

      {open && (
        <div
          role="listbox"
          aria-label={label}
          className="absolute top-full z-20 mt-1 w-full overflow-hidden rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--surface-2)] shadow-[var(--elevation-3)]"
        >
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActiveIndex((i) => Math.max(i - 1, 0));
              } else if (e.key === "Enter" && filtered[activeIndex]) {
                e.preventDefault();
                commit(filtered[activeIndex]);
              } else if (e.key === "Escape") {
                setOpen(false);
              }
            }}
            placeholder="Type to filter…"
            className="w-full border-b border-[var(--border-subtle)] bg-transparent px-3 py-2 text-[var(--text-base)] text-[var(--text-primary)] outline-none"
          />
          <ul className="max-h-60 overflow-y-auto py-1">
            {filtered.length === 0 && (
              <li className="px-3 py-2 text-[var(--text-sm)] text-[var(--text-muted)]">No matches for “{query}”.</li>
            )}
            {filtered.map((opt, i) => (
              <li
                key={opt.value}
                role="option"
                aria-selected={opt.value === value}
                onMouseEnter={() => setActiveIndex(i)}
                onClick={() => commit(opt)}
                className={cn(
                  "cursor-pointer px-3 py-2 text-[var(--text-base)] text-[var(--text-primary)]",
                  i === activeIndex && "bg-[var(--domain-strategy-tint)]",
                )}
              >
                {opt.label}
                {opt.description && <span className="ml-2 text-[var(--text-sm)] text-[var(--text-muted)]">{opt.description}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
