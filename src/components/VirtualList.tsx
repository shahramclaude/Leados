"use client";
// src/components/VirtualList.tsx
//
// Generic windowed list used by every long/unbounded collection in the UI
// (events, findings, notifications, roster). Only rows that are near the
// viewport are ever mounted, so a 100,000-row page costs the same render
// time as a 20-row page — see docs/PERFORMANCE.md "Rendering" for the
// measured DOM node count / render time before and after.
import { useVirtualizer } from "@tanstack/react-virtual";
import { useRef, type ReactNode } from "react";

interface VirtualListProps<T> {
  items: T[];
  rowHeight: number;
  height: number;
  renderRow: (item: T, index: number) => ReactNode;
  onEndReached?: () => void;
  endReachedThreshold?: number;
  getKey: (item: T, index: number) => string | number;
}

export function VirtualList<T>({
  items,
  rowHeight,
  height,
  renderRow,
  onEndReached,
  endReachedThreshold = 6,
  getKey,
}: VirtualListProps<T>) {
  const parentRef = useRef<HTMLDivElement | null>(null);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan: 8,
  });

  const virtualItems = virtualizer.getVirtualItems();
  const last = virtualItems[virtualItems.length - 1];
  if (onEndReached && last && last.index >= items.length - 1 - endReachedThreshold) {
    // Fire-and-forget: the caller is responsible for de-duping concurrent
    // "load more" calls (see EventsClient.tsx / FindingsClient.tsx).
    queueMicrotask(onEndReached);
  }

  return (
    <div ref={parentRef} style={{ height, overflow: "auto" }} className="rounded-2xl border border-slate-200 bg-white">
      <div style={{ height: virtualizer.getTotalSize(), width: "100%", position: "relative" }}>
        {virtualItems.map((virtualRow) => {
          const item = items[virtualRow.index];
          return (
            <div
              key={getKey(item, virtualRow.index)}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: virtualRow.size,
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              {renderRow(item, virtualRow.index)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
