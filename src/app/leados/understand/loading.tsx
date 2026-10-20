import { SkeletonPageHeader, SkeletonTable } from "@/components/leados/ui/Skeleton";

export default function UnderstandLoading() {
  return (
    <>
      <SkeletonPageHeader />
      <SkeletonTable rows={8} cols={5} />
    </>
  );
}
