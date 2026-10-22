"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { PanelSkeleton } from "@/components/Skeletons";
import type { ForecastPoint } from "@/components/ForecastChart";

const ForecastChart = dynamic(() => import("@/components/ForecastChart").then((m) => m.ForecastChart), {
  ssr: false,
  loading: () => <PanelSkeleton label="forecast chart" />,
});

interface ForecastResponse {
  final: { p10: number; p50: number; p90: number };
  series: ForecastPoint[];
  stale: boolean;
  staleForMs: number;
  computeMs: number;
  queueDepth: number;
}

interface ForecastError {
  error: string;
  message: string;
}

/**
 * This panel is rendered above the fold (not gated by useInView) because the
 * forecast is the dashboard's headline KPI — but the heavy chart renderer is
 * still code-split via next/dynamic so it doesn't block the initial shell
 * bundle, and the compute itself is cached/queued server-side (see
 * src/lib/forecastCache.ts) so this fetch is cheap on a warm cache even
 * though the underlying simulation is not.
 */
export function ForecastPanel() {
  const [data, setData] = useState<ForecastResponse | null>(null);
  const [error, setError] = useState<ForecastError | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/forecast?scenario=baseline")
      .then(async (r) => {
        const body = await r.json();
        if (cancelled) return;
        if (!r.ok) {
          setError(body);
        } else {
          setData(body);
          setError(null);
        }
      })
      .catch(() => {
        if (!cancelled) setError({ error: "network", message: "Could not reach the forecast API." });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
        <p className="font-semibold">Forecast temporarily unavailable</p>
        <p className="mt-1">{error.message}</p>
      </div>
    );
  }

  if (!data) return <PanelSkeleton label="forecast" height={260} />;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700">26-week capacity forecast (p10/p50/p90)</h3>
        <span className="text-xs text-slate-400">computed in {data.computeMs}ms, queue depth {data.queueDepth}</span>
      </div>
      {data.stale && (
        <p className="mb-2 rounded bg-amber-50 px-2 py-1 text-xs text-amber-700">
          slow query — showing cached forecast from {Math.round(data.staleForMs / 1000)}s ago while it refreshes
        </p>
      )}
      <ForecastChart series={data.series} />
      <div className="mt-2 grid grid-cols-3 gap-2 text-center text-xs">
        <div className="rounded bg-slate-50 py-2"><div className="font-semibold text-slate-800">{data.final.p10.toFixed(0)}</div>p10</div>
        <div className="rounded bg-slate-50 py-2"><div className="font-semibold text-slate-800">{data.final.p50.toFixed(0)}</div>p50</div>
        <div className="rounded bg-slate-50 py-2"><div className="font-semibold text-slate-800">{data.final.p90.toFixed(0)}</div>p90</div>
      </div>
    </div>
  );
}
