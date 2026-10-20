"use client";

import { useRef } from "react";
import { cx } from "./cx";
import { Popover } from "./Popover";

export interface DropdownItem {
  id: string;
  label: string;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
}

export interface DropdownMenuProps {
  label: string;
  items: DropdownItem[];
  triggerClassName?: string;
  align?: "start" | "end";
}

/** Menu with roving tabindex: ArrowUp/Down moves focus between items, Home/End
 * jump to the ends, Enter/Space activates, Escape closes via Popover. */
export function DropdownMenu({ label, items, triggerClassName, align = "start" }: DropdownMenuProps) {
  const listRef = useRef<HTMLUListElement>(null);

  function onKeyDown(e: React.KeyboardEvent<HTMLUListElement>) {
    const focusables = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>("[role='menuitem']") ?? []);
    const currentIndex = focusables.findIndex((el) => el === document.activeElement);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      focusables[(currentIndex + 1 + focusables.length) % focusables.length]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      focusables[(currentIndex - 1 + focusables.length) % focusables.length]?.focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      focusables[0]?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      focusables[focusables.length - 1]?.focus();
    }
  }

  return (
    <Popover
      align={align}
      trigger={(props) => (
        <button
          type="button"
          {...props}
          className={cx(
            "inline-flex h-[var(--control-height-md)] items-center gap-[var(--space-2)] rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--surface-raised)] px-[var(--space-3)] text-[var(--text-sm)] text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]",
            triggerClassName,
          )}
        >
          {label}
          <svg aria-hidden width="12" height="12" viewBox="0 0 24 24" fill="none">
            <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}
    >
      {(close) => (
        <ul ref={listRef} role="menu" aria-label={label} onKeyDown={onKeyDown} className="flex flex-col gap-[2px]">
          {items.map((item) => (
            <li key={item.id} role="none">
              <button
                role="menuitem"
                type="button"
                disabled={item.disabled}
                onClick={() => {
                  item.onSelect();
                  close();
                }}
                className={cx(
                  "w-full rounded-[var(--radius-sm)] px-[var(--space-2)] py-[var(--space-2)] text-left text-[var(--text-sm)]",
                  "hover:bg-[var(--surface-sunken)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]",
                  item.danger ? "text-[var(--status-danger)]" : "text-[var(--text-primary)]",
                  item.disabled && "cursor-not-allowed opacity-50",
                )}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Popover>
  );
}
