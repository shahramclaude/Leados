// Suspense fallback used by every server-rendered panel on the dashboard
// shell, so the shell paints instantly while panels stream in.
export function PanelSkeleton({ title, rows = 5 }: { title: string; rows?: number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900" aria-busy="true" aria-label={`Loading ${title}`}>
      <div className="mb-3 h-4 w-32 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
      <div className="flex flex-col gap-2">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="h-10 w-full animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800/60" />
        ))}
      </div>
    </div>
  );
}
