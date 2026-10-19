"use client";

import {
  forwardRef,
  useId,
  useMemo,
  useRef,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { cn } from "./utils";

/* ============================== FormField (label/description/error wrapper) ============================== */

export function FormField({
  id,
  label,
  description,
  error,
  required,
  children,
  className,
}: {
  id: string;
  label: string;
  description?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const descId = description ? `${id}-desc` : undefined;
  const errId = error ? `${id}-err` : undefined;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-body-sm font-medium text-text-primary">
        {label}
        {required ? (
          <span aria-hidden="true" className="ml-0.5 text-severity-critical">
            *
          </span>
        ) : null}
      </label>
      {description ? (
        <p id={descId} className="text-caption text-text-tertiary">
          {description}
        </p>
      ) : null}
      {children}
      {error ? (
        <p id={errId} role="alert" className="text-caption font-medium text-severity-critical">
          {error}
        </p>
      ) : null}
    </div>
  );
}

const fieldBase =
  "w-full rounded-md border border-border bg-surface-raised px-3 text-body-sm text-text-primary placeholder:text-text-disabled transition-colors duration-[var(--motion-fast)] ease-[var(--ease-standard)] focus:border-accent disabled:cursor-not-allowed disabled:opacity-50";

/* ============================== Input ============================== */

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ className, invalid, ...props }, ref) {
  return (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(fieldBase, "h-9.5", invalid && "border-severity-critical", className)}
      {...props}
    />
  );
});

/* ============================== Textarea ============================== */

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return <textarea ref={ref} className={cn(fieldBase, "min-h-[6rem] py-2", className)} {...props} />;
  },
);

/* ============================== Select ============================== */

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, children, ...props },
  ref,
) {
  return (
    <select ref={ref} className={cn(fieldBase, "h-9.5 appearance-none bg-[length:16px] pr-8", className)} {...props}>
      {children}
    </select>
  );
});

/* ============================== Checkbox / Radio / Switch ============================== */

export function Checkbox({
  label,
  id,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; id: string }) {
  return (
    <label htmlFor={id} className={cn("flex cursor-pointer items-center gap-2 text-body-sm text-text-primary", className)}>
      <input
        id={id}
        type="checkbox"
        className="h-4 w-4 rounded border-border text-accent accent-[var(--accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]"
        {...props}
      />
      {label}
    </label>
  );
}

export function Radio({
  label,
  id,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; id: string }) {
  return (
    <label htmlFor={id} className={cn("flex cursor-pointer items-center gap-2 text-body-sm text-text-primary", className)}>
      <input
        id={id}
        type="radio"
        className="h-4 w-4 border-border text-accent accent-[var(--accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]"
        {...props}
      />
      {label}
    </label>
  );
}

export function Switch({
  checked,
  onCheckedChange,
  label,
  id,
  disabled,
}: {
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  label: string;
  id: string;
  disabled?: boolean;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "relative inline-flex h-5.5 w-10 shrink-0 items-center rounded-full transition-colors",
        "duration-[var(--motion-fast)] ease-[var(--ease-standard)] disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-accent" : "bg-border-strong",
      )}
    >
      <span className="sr-only">{label}</span>
      <span
        aria-hidden="true"
        className={cn(
          "inline-block h-4.5 w-4.5 translate-x-0.5 rounded-full bg-surface-raised shadow-sm transition-transform",
          "duration-[var(--motion-fast)] ease-[var(--ease-standard)]",
          checked && "translate-x-[1.125rem]",
        )}
      />
    </button>
  );
}

/* ============================== Combobox ============================== */

export interface ComboboxOption {
  value: string;
  label: string;
  hint?: string;
}

export function Combobox({
  id,
  label,
  options,
  value,
  onChange,
  placeholder = "Search…",
}: {
  id: string;
  label: string;
  options: ComboboxOption[];
  value: string | null;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const listId = `${id}-listbox`;
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  const selectedLabel = options.find((o) => o.value === value)?.label ?? "";

  function commit(option: ComboboxOption) {
    onChange(option.value);
    setQuery("");
    setOpen(false);
    inputRef.current?.focus();
  }

  return (
    <div className="relative">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <input
        id={id}
        ref={inputRef}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && filtered[activeIndex] ? `${listId}-${filtered[activeIndex].value}` : undefined}
        className={cn(fieldBase, "h-9.5")}
        placeholder={placeholder}
        value={open ? query : selectedLabel}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setActiveIndex(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActiveIndex((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            if (filtered[activeIndex]) commit(filtered[activeIndex]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
      />
      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label={label}
          className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-md border border-border bg-surface-overlay py-1 shadow-lg"
        >
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-body-sm text-text-tertiary">No matches</li>
          ) : (
            filtered.map((option, i) => (
              <li
                id={`${listId}-${option.value}`}
                key={option.value}
                role="option"
                aria-selected={option.value === value}
                onMouseDown={(e) => {
                  e.preventDefault();
                  commit(option);
                }}
                className={cn(
                  "flex cursor-pointer items-center justify-between px-3 py-2 text-body-sm",
                  i === activeIndex ? "bg-accent-subtle text-accent-subtle-text" : "text-text-primary",
                )}
              >
                <span>{option.label}</span>
                {option.hint ? <span className="text-caption text-text-tertiary">{option.hint}</span> : null}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

/* ============================== DatePicker ============================== */

export function DatePicker({
  id,
  label,
  value,
  onChange,
  min,
  max,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
}) {
  const generatedId = useId();
  const fieldId = id || generatedId;
  return (
    <FormField id={fieldId} label={label}>
      <Input id={fieldId} type="date" value={value} min={min} max={max} onChange={(e) => onChange(e.target.value)} />
    </FormField>
  );
}
