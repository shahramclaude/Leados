"use client";

// ---------------------------------------------------------------------------
// Minimal fixed-row-height windowing so long lists (objectives, approvals,
// audit feed) never mount more than ~viewport+overscan DOM rows. Hand-rolled
// instead of pulling in react-window/react-virtual to keep this out of the
// "heavy engine in initial chunk" budget — it's ~60 lines.
// ---------------------------------------------------------------------------

import { useRef, useState, type CSSProperties, type ReactNode } from "react";

export function VirtualList<T>({
  items,
  rowHeight,
  height,
  overscan = 6,
  renderRow,
  ariaLabel,
}: {
  items: T[];
  rowHeight: number;
  height: number;
  overscan?: number;
  renderRow: (item: T, index: number) => ReactNode;
  ariaLabel: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);

  const totalHeight = items.length * rowHeight;
  const visibleCount = Math.ceil(height / rowHeight);
  const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const endIndex = Math.min(items.length, startIndex + visibleCount + overscan * 2);

  const offsetY = startIndex * rowHeight;

  return (
    <div
      ref={containerRef}
      role="list"
      aria-label={ariaLabel}
      style={{ height, overflowY: "auto" } as CSSProperties}
      className="rounded-xl border border-slate-200"
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
    >
      <div style={{ height: totalHeight, position: "relative" } as CSSProperties}>
        <div style={{ transform: `translateY(${offsetY}px)` } as CSSProperties}>
          {items.slice(startIndex, endIndex).map((item, i) => (
            <div key={startIndex + i} role="listitem" style={{ height: rowHeight } as CSSProperties}>
              {renderRow(item, startIndex + i)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
