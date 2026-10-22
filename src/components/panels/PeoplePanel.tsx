"use client";

import dynamic from "next/dynamic";
import { useInView } from "@/hooks/useInView";
import { PanelSkeleton } from "@/components/Skeletons";

const PeopleTable = dynamic(() => import("@/components/PeopleTable").then((m) => m.PeopleTable), {
  ssr: false,
  loading: () => <PanelSkeleton label="people table" height={420} />,
});

export function PeoplePanel() {
  const { ref, inView } = useInView<HTMLDivElement>();
  return (
    <div ref={ref}>
      <h3 className="mb-2 text-sm font-semibold text-slate-700">People (virtualized, paginated)</h3>
      {inView ? <PeopleTable /> : <PanelSkeleton label="people table" height={420} />}
    </div>
  );
}
