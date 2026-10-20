"use client";

// Generic virtualization wrapper (react-window v2) reused by every long
// list named in requirement E: events, notifications, roster, findings.
// Callers provide `rowHeight` + a `rowComponent`; this component owns
// sizing (a fixed-height viewport, since v2's <List> sizes itself from its
// box) and nothing else, so it stays reusable instead of becoming a
// per-feature god-component.
import type { ReactElement } from "react";
import { List, type RowComponentProps } from "react-window";

export interface VirtualListProps<P extends object> {
  rowCount: number;
  rowHeight: number;
  rowComponent: (props: RowComponentProps<P>) => ReactElement;
  rowProps: P;
  height?: number;
  emptyLabel?: string;
  "aria-label"?: string;
}

export function VirtualList<P extends object>({
  rowCount,
  rowHeight,
  rowComponent,
  rowProps,
  height = 420,
  emptyLabel = "Nothing here yet.",
  ...rest
}: VirtualListProps<P>) {
  if (rowCount === 0) {
    return (
      <div className="flex h-24 items-center justify-center text-sm text-slate-500 dark:text-slate-400">
        {emptyLabel}
      </div>
    );
  }

  return (
    <div style={{ height }} role="list" aria-label={rest["aria-label"]}>
      {/* react-window v2's `rowProps` type excludes a few reserved keys via a
          mapped type it can't prove generically here; `P` is constrained to
          `object` by this component's own signature, so this cast is safe. */}
      <List
        rowComponent={rowComponent}
        rowCount={rowCount}
        rowHeight={rowHeight}
        rowProps={rowProps as never}
      />
    </div>
  );
}
