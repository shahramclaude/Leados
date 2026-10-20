export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={["rounded-[var(--radius-sm)] bg-[var(--ink-200)]", "animate-[leados-skeleton-pulse_1.4s_ease-in-out_infinite]", className].join(
        " ",
      )}
      style={{ backgroundColor: "var(--border-subtle)" }}
    />
  );
}

/** Reserves the exact layout of a loaded page/table to keep CLS near zero. */
export function SkeletonPageHeader() {
  return (
    <div className="flex items-center justify-between py-2">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-7 w-64" />
      </div>
      <Skeleton className="h-9 w-32" />
    </div>
  );
}

export function SkeletonTable({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="overflow-hidden rounded-[var(--radius-md)] border border-border-subtle">
      <div className="flex gap-4 border-b border-border-subtle bg-surface-sunken px-4 py-2">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-3 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, row) => (
        <div key={row} className="flex gap-4 border-b border-border-subtle px-4 py-3 last:border-b-0">
          {Array.from({ length: cols }).map((_, col) => (
            <Skeleton key={col} className="h-3.5 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SkeletonCards({ count = 3 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex flex-col gap-3 rounded-[var(--comp-card-radius)] border border-border-subtle p-[var(--comp-card-padding)]">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-10 w-full" />
        </div>
      ))}
    </div>
  );
}
