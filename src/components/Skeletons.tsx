// src/components/Skeletons.tsx
//
// Skeletons sized to match the real content exactly (same height, same
// grid) so nothing shifts when data/charts arrive — i.e. no layout shift
// (CLS) between skeleton and final render.
export function KpiTileSkeleton() {
  return (
    <div className="flex h-[104px] flex-col justify-between rounded-2xl border border-slate-200 bg-white p-4">
      <div className="skeleton h-3 w-20 rounded" />
      <div className="skeleton h-7 w-16 rounded" />
    </div>
  );
}

export function ChartPanelSkeleton({ height = 260 }: { height?: number }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="skeleton mb-3 h-3 w-32 rounded" />
      <div className="skeleton rounded-xl" style={{ height }} />
    </div>
  );
}

export function ListRowSkeleton() {
  return (
    <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
      <div className="skeleton h-8 w-8 shrink-0 rounded-full" />
      <div className="flex-1 space-y-2">
        <div className="skeleton h-3 w-1/3 rounded" />
        <div className="skeleton h-2.5 w-1/2 rounded" />
      </div>
      <div className="skeleton h-3 w-14 rounded" />
    </div>
  );
}

export function ListSkeleton({ rows = 10 }: { rows?: number }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      {Array.from({ length: rows }).map((_, i) => (
        <ListRowSkeleton key={i} />
      ))}
    </div>
  );
}
