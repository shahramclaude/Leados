"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useInView } from "@/hooks/useInView";
import { PanelSkeleton } from "@/components/Skeletons";
import type { NetworkGraphData } from "@/components/Network";

// Lazy-loaded, client-only: canvas graph rendering never needs to be part of
// the initial server-rendered/shell JS payload (Phase 3 bundle discipline).
const Network = dynamic(() => import("@/components/Network").then((m) => m.Network), {
  ssr: false,
  loading: () => <PanelSkeleton label="network graph" />,
});

export function NetworkPanel() {
  const { ref, inView } = useInView<HTMLDivElement>();
  const [data, setData] = useState<NetworkGraphData | null>(null);

  useEffect(() => {
    if (!inView || data) return;
    fetch("/api/network")
      .then((r) => r.json())
      .then(setData);
  }, [inView, data]);

  return (
    <div ref={ref}>
      <h3 className="mb-2 text-sm font-semibold text-slate-700">Org network</h3>
      {!inView || !data ? <PanelSkeleton label="network graph" /> : <Network data={data} />}
    </div>
  );
}
