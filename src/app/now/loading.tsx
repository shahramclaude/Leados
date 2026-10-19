import { Skeleton, SkeletonText } from "@/components/leados/ui";

export default function NowLoading() {
  return (
    <div className="flex flex-col gap-6" role="status" aria-label="Loading today's view">
      <div className="flex flex-col gap-3 border-b border-border-subtle pb-5">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-border bg-surface-raised p-4">
            <SkeletonText lines={3} />
          </div>
        ))}
      </div>
      <div className="rounded-lg border border-border bg-surface-raised p-4">
        <SkeletonText lines={6} />
      </div>
    </div>
  );
}
