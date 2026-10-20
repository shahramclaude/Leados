import { SkeletonCards, SkeletonPageHeader, SkeletonTable } from "@/components/leados/ui/Skeleton";

export default function CockpitLoading() {
  return (
    <>
      <SkeletonPageHeader />
      <div className="flex flex-col gap-6">
        <SkeletonCards count={4} />
        <SkeletonTable rows={6} cols={6} />
      </div>
    </>
  );
}
