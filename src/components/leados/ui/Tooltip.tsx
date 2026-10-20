"use client";

import { useId, useRef, useState, type ReactElement, type ReactNode } from "react";
import { cloneElement } from "react";
import { cx } from "./cx";

export interface TooltipProps {
  content: ReactNode;
  children: ReactElement<Record<string, unknown>>;
  side?: "top" | "bottom" | "left" | "right";
}

const SIDE_CLASS: Record<NonNullable<TooltipProps["side"]>, string> = {
  top: "bottom-full left-1/2 mb-[var(--space-2)] -translate-x-1/2",
  bottom: "top-full left-1/2 mt-[var(--space-2)] -translate-x-1/2",
  left: "right-full top-1/2 mr-[var(--space-2)] -translate-y-1/2",
  right: "left-full top-1/2 ml-[var(--space-2)] -translate-y-1/2",
};

/** Keyboard-triggerable tooltip: shows on focus as well as hover, hides on
 * Escape/blur, and is wired via aria-describedby rather than title so
 * screen readers announce it predictably. */
export function Tooltip({ content, children, side = "top" }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const id = useId();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function show() {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setVisible(true);
  }
  function hide() {
    setVisible(false);
  }

  type AnyHandler = ((event: unknown) => void) | undefined;
  const childProps = children.props as Record<string, unknown>;
  const callHandler = (name: string, event: unknown) => {
    const handler = childProps[name] as AnyHandler;
    handler?.(event);
  };

  const trigger = cloneElement(children, {
    "aria-describedby": id,
    onMouseEnter: (e: React.MouseEvent) => {
      show();
      callHandler("onMouseEnter", e);
    },
    onMouseLeave: (e: React.MouseEvent) => {
      hide();
      callHandler("onMouseLeave", e);
    },
    onFocus: (e: React.FocusEvent) => {
      show();
      callHandler("onFocus", e);
    },
    onBlur: (e: React.FocusEvent) => {
      hide();
      callHandler("onBlur", e);
    },
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Escape") hide();
      callHandler("onKeyDown", e);
    },
  });

  return (
    <span className="relative inline-flex">
      {trigger}
      <span
        role="tooltip"
        id={id}
        className={cx(
          "pointer-events-none absolute z-30 whitespace-nowrap rounded-[var(--radius-sm)] bg-[var(--gray-900)] px-[var(--space-2)] py-1 text-[var(--text-xs)] text-white shadow-[var(--shadow-md)] transition-opacity duration-[var(--duration-fast)] ease-[var(--ease-standard)]",
          SIDE_CLASS[side],
          visible ? "opacity-100" : "opacity-0",
        )}
      >
        {content}
      </span>
    </span>
  );
}
