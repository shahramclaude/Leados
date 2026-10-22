"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useInView } from "@/hooks/useInView";
import { PanelSkeleton } from "@/components/Skeletons";
import type { HeatmapCell } from "@/components/Heatmap";

const Heatmap = dynamic(() => import("@/components/Heatmap").then((m) => m.Heatmap), {
  ssr: false,
  loading: () => <PanelSkeleton label="activity heatmap" height={160} />,
});

interface HeatmapResponse {
  cells: HeatmapCell[];
  stale: boolean;
  staleForMs: number;
}

export function HeatmapPanel() {
  const { ref, inView } = useInView<HTMLDivElement>();
  const [data, setData] = useState<HeatmapResponse | null>(null);

  useEffect(() => {
    if (!inView || data) return;
    fetch("/api/heatmap")
      .then((r) => r.json())
      .then(setData);
  }, [inView, data]);

  return (
    <div ref={ref}>
      <h3 className="mb-2 text-sm font-semibold text-slate-700">Decision activity (365d)</h3>
      {!inView || !data ? (
        <PanelSkeleton label="activity heatmap" height={160} />
      ) : (
        <Heatmap cells={data.cells} stale={data.stale} staleForMs={data.staleForMs} />
      )}
    </div>
  );
}
