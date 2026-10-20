"use client";

import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Popover } from "./Popover";

export interface DropdownItem {
  id: string;
  label: string;
  onSelect: () => void;
  destructive?: boolean;
  disabled?: boolean;
}

export interface DropdownMenuProps {
  trigger: (props: { onClick: () => void; ref: React.RefObject<HTMLButtonElement | null>; open: boolean }) => ReactNode;
  items: DropdownItem[];
  align?: "start" | "end";
}

/** DropdownMenu with arrow-key roving focus, Home/End, Escape-to-close and focus restore. */
export function DropdownMenu({ trigger, items, align = "start" }: DropdownMenuProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  function openMenu() {
    setOpen(true);
    setActiveIndex(0);
    requestAnimationFrame(() => itemRefs.current[0]?.focus());
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const enabled = items.map((item, i) => ({ item, i })).filter(({ item }) => !item.disabled);
    if (enabled.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      const pos = enabled.findIndex(({ i }) => i === activeIndex);
      const next = enabled[(pos + 1) % enabled.length].i;
      setActiveIndex(next);
      itemRefs.current[next]?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      const pos = enabled.findIndex(({ i }) => i === activeIndex);
      const next = enabled[(pos - 1 + enabled.length) % enabled.length].i;
      setActiveIndex(next);
      itemRefs.current[next]?.focus();
    } else if (event.key === "Home") {
      event.preventDefault();
      setActiveIndex(enabled[0].i);
      itemRefs.current[enabled[0].i]?.focus();
    } else if (event.key === "End") {
      event.preventDefault();
      const last = enabled[enabled.length - 1].i;
      setActiveIndex(last);
      itemRefs.current[last]?.focus();
    }
  }

  return (
    <div className="relative inline-block">
      {trigger({ onClick: () => (open ? setOpen(false) : openMenu()), ref: buttonRef, open })}
      <Popover open={open} onClose={() => setOpen(false)} anchorRef={buttonRef} align={align}>
        <div role="menu" aria-orientation="vertical" onKeyDown={onKeyDown} className="flex min-w-[10rem] flex-col">
          {items.map((item, index) => (
            <button
              key={item.id}
              ref={(el) => {
                itemRefs.current[index] = el;
              }}
              role="menuitem"
              type="button"
              disabled={item.disabled}
              onClick={() => {
                item.onSelect();
                setOpen(false);
                buttonRef.current?.focus();
              }}
              className={[
                "rounded-[var(--radius-xs)] px-3 py-1.5 text-left text-sm",
                "hover:bg-surface-sunken focus-visible:bg-surface-sunken focus-visible:outline-none",
                item.destructive ? "text-status-danger" : "text-text-primary",
                item.disabled ? "cursor-not-allowed opacity-50" : "",
              ].join(" ")}
            >
              {item.label}
            </button>
          ))}
        </div>
      </Popover>
    </div>
  );
}
