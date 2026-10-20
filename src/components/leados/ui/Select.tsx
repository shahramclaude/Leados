"use client";

import {
  forwardRef,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

export interface SelectOption {
  value: string;
  label: string;
  description?: string;
}

export interface SelectProps {
  label?: string;
  hint?: string;
  required?: boolean;
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  size?: "sm" | "md" | "lg";
  placeholder?: string;
  id?: string;
}

const CONTROL_HEIGHT: Record<"sm" | "md" | "lg", string> = {
  sm: "h-[var(--comp-control-height-sm)] text-sm",
  md: "h-[var(--comp-control-height-md)] text-sm",
  lg: "h-[var(--comp-control-height-lg)] text-base",
};

/** Native-backed select: full keyboard + screen-reader support for free, styled to tokens. */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hint, required, options, value, onChange, size = "md", placeholder, id },
  ref,
) {
  const autoId = useId();
  const selectId = id ?? autoId;
  const descId = hint ? `${selectId}-hint` : undefined;
  return (
    <div className="flex flex-col gap-1.5">
      {label ? (
        <label htmlFor={selectId} className="text-sm font-medium text-text-secondary">
          {label}
          {required ? (
            <span aria-hidden="true" className="ml-0.5 text-status-danger">
              *
            </span>
          ) : null}
        </label>
      ) : null}
      <select
        ref={ref}
        id={selectId}
        required={required}
        aria-describedby={descId}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={[
          "rounded-[var(--radius-sm)] border border-border-subtle bg-surface-base px-3 text-text-primary outline-none",
          "focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-[var(--focus-ring)]",
          CONTROL_HEIGHT[size],
        ].join(" ")}
      >
        {placeholder ? (
          <option value="" disabled>
            {placeholder}
          </option>
        ) : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {hint ? (
        <p id={descId} className="text-xs text-text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
});

export interface ComboboxProps {
  label?: string;
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  onQueryChange?: (query: string) => void;
  loading?: boolean;
  placeholder?: string;
}

/** Typeahead combobox with roving active-descendant, ARIA 1.2 pattern, async-friendly. */
export function Combobox({ label, options, value, onChange, onQueryChange, loading, placeholder }: ComboboxProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(() => options.find((o) => o.value === value)?.label ?? "");
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    if (!query) return options;
    const q = query.toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  useEffect(() => {
    setActiveIndex(0);
  }, [filtered.length, open]);

  function commit(option: SelectOption) {
    onChange(option.value);
    setQuery(option.label);
    setOpen(false);
    inputRef.current?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (event.key === "Enter") {
      if (open && filtered[activeIndex]) {
        event.preventDefault();
        commit(filtered[activeIndex]);
      }
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="relative flex flex-col gap-1.5">
      {label ? (
        <label htmlFor={id} className="text-sm font-medium text-text-secondary">
          {label}
        </label>
      ) : null}
      <input
        ref={inputRef}
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={`${id}-listbox`}
        aria-autocomplete="list"
        aria-activedescendant={open && filtered[activeIndex] ? `${id}-opt-${activeIndex}` : undefined}
        value={query}
        placeholder={placeholder}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
          onQueryChange?.(event.target.value);
        }}
        onKeyDown={onKeyDown}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        className="h-[var(--comp-control-height-md)] rounded-[var(--radius-sm)] border border-border-subtle bg-surface-base px-3 text-sm text-text-primary outline-none focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-[var(--focus-ring)]"
      />
      {open ? (
        <ul
          ref={listRef}
          id={`${id}-listbox`}
          role="listbox"
          className="absolute top-full z-20 mt-1 max-h-60 w-full overflow-auto rounded-[var(--radius-sm)] border border-border-subtle bg-surface-overlay py-1 shadow-[var(--elevation-2)]"
        >
          {loading ? (
            <li className="px-3 py-2 text-sm text-text-muted">Searching…</li>
          ) : filtered.length === 0 ? (
            <li className="px-3 py-2 text-sm text-text-muted">No matches</li>
          ) : (
            filtered.map((option, index) => (
              <li
                key={option.value}
                id={`${id}-opt-${index}`}
                role="option"
                aria-selected={option.value === value}
                onMouseDown={(event) => {
                  event.preventDefault();
                  commit(option);
                }}
                className={[
                  "cursor-pointer px-3 py-1.5 text-sm",
                  index === activeIndex ? "bg-accent-subtle text-text-primary" : "text-text-secondary",
                ].join(" ")}
              >
                {option.label}
                {option.description ? (
                  <span className="ml-2 text-xs text-text-muted">{option.description}</span>
                ) : null}
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
