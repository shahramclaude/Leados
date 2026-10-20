// Skeletons mirror the exact pixel height of their real panel counterpart so
// swapping skeleton -> real content never shifts layout (zero CLS).

export function KpiTileSkeleton() {
  return (
    <div className="h-[104px] animate-pulse rounded-2xl border border-slate-200 bg-slate-100 p-4">
      <div className="h-3 w-20 rounded bg-slate-200" />
      <div className="mt-4 h-7 w-24 rounded bg-slate-200" />
    </div>
  );
}

export function ChartPanelSkeleton({ height = 280, title }: { height?: number; title: string }) {
  return (
    <div style={{ height }} className="flex flex-col rounded-2xl border border-slate-200 bg-white p-4">
      <div className="h-4 w-32 animate-pulse rounded bg-slate-200" />
      <div className="mt-3 flex-1 animate-pulse rounded-xl bg-slate-100" />
      <span className="sr-only">Loading {title}</span>
    </div>
  );
}

export function TableSkeleton({ rows = 8, rowHeight = 36 }: { rows?: number; rowHeight?: number }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          style={{ height: rowHeight }}
          className="flex animate-pulse items-center gap-3 border-b border-slate-100 px-3 last:border-0"
        >
          <div className="h-3 w-20 rounded bg-slate-200" />
          <div className="h-3 flex-1 rounded bg-slate-100" />
          <div className="h-3 w-16 rounded bg-slate-200" />
        </div>
      ))}
    </div>
  );
}
