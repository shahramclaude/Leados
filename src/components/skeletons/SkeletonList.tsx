export function SkeletonList({ rows = 8, rowHeight = 64 }: { rows?: number; rowHeight?: number }) {
  return (
    <div className="animate-pulse space-y-2" aria-busy="true" aria-label="Loading list">
      <div className="h-10 rounded-lg border border-slate-200 bg-slate-100" />
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          style={{ height: rowHeight }}
          className="rounded-xl border border-slate-200 bg-slate-100"
        />
      ))}
    </div>
  );
}
