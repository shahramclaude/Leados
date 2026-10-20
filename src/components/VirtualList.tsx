"use client";

import { useRef, useState, type CSSProperties, type ReactNode } from "react";

type VirtualListProps<T> = {
  items: T[];
  rowHeight: number;
  height: number;
  overscan?: number;
  renderRow: (item: T, index: number) => ReactNode;
  className?: string;
  emptyState?: ReactNode;
};

/**
 * Minimal fixed-row-height windowing list. Avoids pulling in a third-party
 * virtualization dependency for the common "thousands of rows, fixed height
 * row" case that covers the events table, notification feed, roster and
 * findings list. Only the rows within the viewport (+ overscan) are mounted,
 * so DOM node count stays constant regardless of dataset size.
 */
export function VirtualList<T>({
  items,
  rowHeight,
  height,
  overscan = 6,
  renderRow,
  className,
  emptyState,
}: VirtualListProps<T>) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);

  const totalHeight = items.length * rowHeight;
  const visibleCount = Math.ceil(height / rowHeight);
  const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const endIndex = Math.min(items.length, startIndex + visibleCount + overscan * 2);

  const offsetY = startIndex * rowHeight;
  const visibleItems = items.slice(startIndex, endIndex);

  if (items.length === 0 && emptyState) {
    return (
      <div style={{ height }} className={className}>
        {emptyState}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
      style={{ height, overflowY: "auto", position: "relative" }}
      className={className}
      data-testid="virtual-list"
      data-total={items.length}
      data-rendered={visibleItems.length}
    >
      <div style={{ height: totalHeight, position: "relative" }}>
        <div style={{ transform: `translateY(${offsetY}px)` } satisfies CSSProperties}>
          {visibleItems.map((item, i) => (
            <div key={startIndex + i} style={{ height: rowHeight }}>
              {renderRow(item, startIndex + i)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
