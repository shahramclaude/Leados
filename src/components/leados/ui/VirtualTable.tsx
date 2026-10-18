"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

interface VirtualTableProps<T> {
  items: T[];
  rowHeight: number;
  viewportHeight: number;
  renderRow: (item: T, index: number) => ReactNode;
  overscan?: number;
  getKey: (item: T, index: number) => string | number;
}

// Minimal window-based virtualization: only rows within the viewport plus an
// `overscan` buffer (default 5, per spec "±5 rows outside viewport") are
// mounted. Falls back to rendering everything when the list is small enough
// that virtualization wouldn't help (< 100 rows), per spec.
export default function VirtualTable<T>({
  items,
  rowHeight,
  viewportHeight,
  renderRow,
  overscan = 5,
  getKey,
}: VirtualTableProps<T>) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const topSentinelRef = useRef<HTMLDivElement | null>(null);
  const bottomSentinelRef = useRef<HTMLDivElement | null>(null);
  const [range, setRange] = useState<{ start: number; end: number }>({
    start: 0,
    end: Math.min(items.length, Math.ceil(viewportHeight / rowHeight) + overscan * 2),
  });

  const shouldVirtualize = items.length > 100;

  useEffect(() => {
    if (!shouldVirtualize) {
      setRange({ start: 0, end: items.length });
      return;
    }
    const container = containerRef.current;
    if (!container) return;

    const recompute = () => {
      const scrollTop = container.scrollTop;
      const visibleCount = Math.ceil(viewportHeight / rowHeight);
      const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
      const end = Math.min(items.length, Math.floor(scrollTop / rowHeight) + visibleCount + overscan);
      setRange({ start, end });
    };

    recompute();
    container.addEventListener("scroll", recompute, { passive: true });

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) recompute();
        }
      },
      { root: container, threshold: 0 }
    );
    if (topSentinelRef.current) observer.observe(topSentinelRef.current);
    if (bottomSentinelRef.current) observer.observe(bottomSentinelRef.current);

    return () => {
      container.removeEventListener("scroll", recompute);
      observer.disconnect();
    };
  }, [items.length, rowHeight, viewportHeight, overscan, shouldVirtualize]);

  if (!shouldVirtualize) {
    return (
      <div style={{ maxHeight: viewportHeight, overflowY: "auto" }}>
        {items.map((item, i) => (
          <div key={getKey(item, i)} style={{ height: rowHeight }}>
            {renderRow(item, i)}
          </div>
        ))}
      </div>
    );
  }

  const totalHeight = items.length * rowHeight;
  const offsetTop = range.start * rowHeight;
  const visibleItems = items.slice(range.start, range.end);

  return (
    <div ref={containerRef} style={{ height: viewportHeight, overflowY: "auto", position: "relative" }}>
      <div ref={topSentinelRef} style={{ position: "absolute", top: offsetTop, height: 1, width: 1 }} />
      <div style={{ height: totalHeight, position: "relative" }}>
        <div style={{ position: "absolute", top: offsetTop, left: 0, right: 0 }}>
          {visibleItems.map((item, i) => (
            <div key={getKey(item, range.start + i)} style={{ height: rowHeight }}>
              {renderRow(item, range.start + i)}
            </div>
          ))}
        </div>
      </div>
      <div ref={bottomSentinelRef} style={{ position: "absolute", top: offsetTop + visibleItems.length * rowHeight, height: 1, width: 1 }} />
    </div>
  );
}
