"use client";

import {
  Children,
  cloneElement,
  isValidElement,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { cn, useStableId } from "./utils";
import { useFocusTrap, useOnClickOutside } from "./useFocusTrap";
import { IconButton } from "./Primitives";

/* ============================== Tooltip ============================== */

export function Tooltip({ content, children }: { content: ReactNode; children: ReactElement }) {
  const [open, setOpen] = useState(false);
  const id = useStableId("tooltip");
  const child = Children.only(children);

  if (!isValidElement(child)) return children;

  return (
    <span className="relative inline-flex">
      {cloneElement(child as ReactElement<Record<string, unknown>>, {
        "aria-describedby": id,
        onMouseEnter: () => setOpen(true),
        onMouseLeave: () => setOpen(false),
        onFocus: () => setOpen(true),
        onBlur: () => setOpen(false),
      })}
      <span
        role="tooltip"
        id={id}
        className={cn(
          "pointer-events-none absolute -top-2 left-1/2 z-50 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md bg-text-primary px-2 py-1 text-caption font-medium text-surface shadow-md transition-opacity duration-[var(--motion-fast)]",
          open ? "opacity-100" : "opacity-0",
        )}
      >
        {content}
      </span>
    </span>
  );
}

/* ============================== Popover ============================== */

export function Popover({
  trigger,
  children,
  align = "start",
}: {
  trigger: (props: { onClick: () => void; "aria-expanded": boolean; ref: React.RefObject<HTMLButtonElement | null> }) => ReactNode;
  children: ReactNode;
  align?: "start" | "end";
}) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useOnClickOutside(panelRef, () => setOpen(false), open);

  return (
    <div className="relative inline-block">
      {trigger({ onClick: () => setOpen((o) => !o), "aria-expanded": open, ref: triggerRef })}
      {open ? (
        <div
          ref={panelRef}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setOpen(false);
              triggerRef.current?.focus();
            }
          }}
          className={cn(
            "absolute z-40 mt-2 min-w-[14rem] rounded-lg border border-border bg-surface-overlay p-2 shadow-lg",
            "animate-[leados-fade-in-up_var(--motion-slow)_var(--ease-decelerate)]",
            align === "end" ? "right-0" : "left-0",
          )}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

/* ============================== DropdownMenu ============================== */

export interface MenuItem {
  key: string;
  label: ReactNode;
  onSelect: () => void;
  icon?: ReactNode;
  destructive?: boolean;
}

export function DropdownMenu({
  trigger,
  items,
  align = "start",
}: {
  trigger: ReactNode;
  items: MenuItem[];
  align?: "start" | "end";
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useStableId("menu");

  useOnClickOutside(panelRef, () => setOpen(false), open);

  return (
    <div className="relative inline-block">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className="inline-flex"
      >
        {trigger}
      </button>
      {open ? (
        <div
          id={menuId}
          ref={panelRef}
          role="menu"
          className={cn(
            "absolute z-40 mt-2 min-w-[12rem] rounded-lg border border-border bg-surface-overlay p-1.5 shadow-lg",
            "animate-[leados-fade-in-up_var(--motion-slow)_var(--ease-decelerate)]",
            align === "end" ? "right-0" : "left-0",
          )}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setOpen(false);
              triggerRef.current?.focus();
            } else if (e.key === "ArrowDown") {
              e.preventDefault();
              setActiveIndex((i) => (i + 1) % items.length);
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActiveIndex((i) => (i - 1 + items.length) % items.length);
            } else if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              items[activeIndex]?.onSelect();
              setOpen(false);
              triggerRef.current?.focus();
            }
          }}
        >
          {items.map((item, i) => (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              tabIndex={i === activeIndex ? 0 : -1}
              ref={(el) => {
                if (i === activeIndex) el?.focus();
              }}
              onClick={() => {
                item.onSelect();
                setOpen(false);
                triggerRef.current?.focus();
              }}
              onMouseEnter={() => setActiveIndex(i)}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-body-sm transition-colors",
                item.destructive ? "text-severity-critical hover:bg-severity-critical-subtle" : "text-text-primary hover:bg-surface-raised",
                i === activeIndex && !item.destructive && "bg-surface-raised",
              )}
            >
              {item.icon ? (
                <span aria-hidden="true" className="text-text-tertiary">
                  {item.icon}
                </span>
              ) : null}
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/* ============================== Modal ============================== */

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const titleId = useStableId("modal-title");
  const descId = useStableId("modal-desc");

  useFocusTrap(open, containerRef, onClose);

  if (!open || typeof document === "undefined") return null;

  const widths = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-2xl" };

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div aria-hidden="true" className="absolute inset-0 bg-scrim" onClick={onClose} />
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        className={cn(
          "relative z-10 w-full rounded-xl border border-border bg-surface-overlay shadow-xl",
          "animate-[leados-fade-in-up_var(--motion-slow)_var(--ease-decelerate)]",
          widths[size],
        )}
      >
        <div className="flex items-start justify-between gap-3 border-b border-border-subtle px-5 py-4">
          <div>
            <h2 id={titleId} className="text-h4 font-semibold text-text-primary">
              {title}
            </h2>
            {description ? (
              <p id={descId} className="mt-1 text-body-sm text-text-secondary">
                {description}
              </p>
            ) : null}
          </div>
          <IconButton label="Close dialog" onClick={onClose}>
            ✕
          </IconButton>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer ? <div className="flex justify-end gap-2 border-t border-border-subtle px-5 py-3">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}

/* ============================== Drawer ============================== */

export function Drawer({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  side = "right",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  side?: "right" | "left";
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const titleId = useStableId("drawer-title");

  useFocusTrap(open, containerRef, onClose);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[80]">
      <div aria-hidden="true" className="absolute inset-0 bg-scrim" onClick={onClose} />
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          "absolute top-0 flex h-full w-full max-w-md flex-col border-border bg-surface-overlay shadow-xl",
          "animate-[leados-fade-in-up_var(--motion-slow)_var(--ease-decelerate)]",
          side === "right" ? "right-0 border-l" : "left-0 border-r",
        )}
      >
        <div className="flex items-start justify-between gap-3 border-b border-border-subtle px-5 py-4">
          <div>
            <h2 id={titleId} className="text-h4 font-semibold text-text-primary">
              {title}
            </h2>
            {description ? <p className="mt-1 text-body-sm text-text-secondary">{description}</p> : null}
          </div>
          <IconButton label="Close panel" onClick={onClose}>
            ✕
          </IconButton>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer ? <div className="flex justify-end gap-2 border-t border-border-subtle px-5 py-3">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}


