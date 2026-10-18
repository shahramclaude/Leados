"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

export interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  side?: "top" | "bottom" | "left" | "right";
}

export default function Tooltip({ content, children, side = "top" }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const [resolvedSide, setResolvedSide] = useState(side);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!visible || !wrapRef.current || !bubbleRef.current) return;
    const wrapRect = wrapRef.current.getBoundingClientRect();
    const bubbleRect = bubbleRef.current.getBoundingClientRect();
    let next = side;

    if (side === "top" && wrapRect.top - bubbleRect.height < 8) next = "bottom";
    if (side === "bottom" && wrapRect.bottom + bubbleRect.height > window.innerHeight - 8) next = "top";
    if (side === "left" && wrapRect.left - bubbleRect.width < 8) next = "right";
    if (side === "right" && wrapRect.right + bubbleRect.width > window.innerWidth - 8) next = "left";

    setResolvedSide(next);
  }, [visible, side]);

  const positions: Record<string, string> = {
    top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
    left: "right-full top-1/2 -translate-y-1/2 mr-2",
    right: "left-full top-1/2 -translate-y-1/2 ml-2",
  };

  return (
    <span
      ref={wrapRef}
      className="relative inline-flex"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
    >
      {children}
      {visible && (
        <div
          ref={bubbleRef}
          role="tooltip"
          className={`absolute z-50 whitespace-nowrap rounded-md border px-2.5 py-1.5 ${positions[resolvedSide]}`}
          style={{
            backgroundColor: "var(--bg-overlay)",
            borderColor: "var(--border-default)",
            color: "var(--text-primary)",
            fontSize: "var(--fs-xs)",
            boxShadow: "var(--shadow-overlay)",
          }}
        >
          {content}
        </div>
      )}
    </span>
  );
}
