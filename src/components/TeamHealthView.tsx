"use client";

import { useEffect, useState } from "react";
import { useActor, actorFetch } from "@/lib/actorContext";
import { RadarChart } from "./charts/RadarChart";
import { ChartFrame } from "./charts/ChartFrame";
import type { Explain } from "@/lib/explain";
import type { RadarDimension } from "@/lib/teamHealth";

interface TeamHealthRadar {
  teamId: string;
  axes: Record<RadarDimension, Explain<number>>;
  recommendations: {
    id: string;
    title: string;
    appliesToDimension: RadarDimension;
    expectedEffect: Explain<string>;
  }[];
}

const DIM_LABEL: Record<RadarDimension, string> = {
  engagement: "Engagement",
  workload: "Workload",
  velocity: "Velocity",
  quality: "Quality (capability proxy)",
  risk: "Retention (inverse risk)",
};

export function TeamHealthView({ teamId }: { teamId: string }) {
  const { currentActorId } = useActor();
  const [radar, setRadar] = useState<TeamHealthRadar | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drill, setDrill] = useState<RadarDimension | null>(null);

  useEffect(() => {
    if (!currentActorId) return;
    setRadar(null);
    setError(null);
    actorFetch(currentActorId, `/api/team-health/${teamId}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error ?? "Failed to load team health");
        return r.json();
      })
      .then(setRadar)
      .catch((e) => setError(e.message));
  }, [currentActorId, teamId]);

  if (error) return <p className="text-sm text-rose-600">{error}</p>;
  if (!radar) return <p className="text-sm text-slate-400">Loading…</p>;

  const axes = (Object.keys(radar.axes) as RadarDimension[]).map((k) => ({
    label: DIM_LABEL[k],
    value: radar.axes[k].value,
  }));

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <ChartFrame
        title="Team health radar"
        caption="Higher = healthier on every axis. Click a dimension below for the evidence behind it."
        uncertaintyNote="Each axis is a proxy built from workplace metadata (see per-axis method); none of this measures feelings directly."
      >
        <RadarChart axes={axes} />
      </ChartFrame>

      <div>
        <div className="mb-3 flex flex-wrap gap-2">
          {(Object.keys(radar.axes) as RadarDimension[]).map((k) => (
            <button
              key={k}
              onClick={() => setDrill(drill === k ? null : k)}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${
                drill === k ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-slate-200 text-slate-600"
              }`}
            >
              {DIM_LABEL[k]}: {radar.axes[k].value}
            </button>
          ))}
        </div>
        {drill && (
          <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm">
            <p className="text-slate-700">
              <span className="font-medium">Method:</span> {radar.axes[drill].method}
            </p>
            <p className="mt-1 text-xs text-amber-800">{radar.axes[drill].uncertaintyNote}</p>
          </div>
        )}

        <h3 className="mb-2 mt-4 text-sm font-semibold text-slate-900">Recommended interventions (Part 11 seam)</h3>
        <div className="space-y-2">
          {radar.recommendations.map((rec) => (
            <div key={rec.id} className="rounded-xl border border-slate-200 bg-white p-3 text-sm">
              <div className="font-medium text-slate-800">{rec.title}</div>
              <div className="mt-1 text-xs text-slate-600">{rec.expectedEffect.value}</div>
              <div className="mt-1 text-[11px] text-amber-800">{rec.expectedEffect.uncertaintyNote}</div>
            </div>
          ))}
          {radar.recommendations.length === 0 && (
            <p className="text-sm text-slate-400">No dimension is currently below the 60-point review threshold.</p>
          )}
        </div>
      </div>
    </div>
  );
}
