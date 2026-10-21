export function SkeletonDetail() {
  return (
    <div className="animate-pulse space-y-6" aria-busy="true" aria-label="Loading detail">
      <div className="space-y-2">
        <div className="h-7 w-2/3 rounded bg-slate-100" />
        <div className="h-4 w-1/3 rounded bg-slate-100" />
      </div>
      <div className="h-[120px] rounded-2xl border border-slate-200 bg-slate-100" />
      <div className="space-y-2">
        <div className="h-5 w-40 rounded bg-slate-100" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-[72px] rounded-xl border border-slate-200 bg-slate-100" />
        ))}
      </div>
    </div>
  );
}
