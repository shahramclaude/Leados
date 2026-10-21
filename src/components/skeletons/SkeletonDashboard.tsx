// Dimensions here must match the real dashboard grid exactly (same gap,
// same card min-height) so swapping skeleton -> real content causes 0 CLS.

export function SkeletonDashboard() {
  return (
    <div className="animate-pulse space-y-6" aria-busy="true" aria-label="Loading dashboard">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-[104px] rounded-2xl border border-slate-200 bg-slate-100" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="h-[280px] rounded-2xl border border-slate-200 bg-slate-100" />
        <div className="h-[280px] rounded-2xl border border-slate-200 bg-slate-100" />
      </div>
    </div>
  );
}
