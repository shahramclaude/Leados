"use client";

import { useEffect, useState } from "react";
import { useActor, useActorFetch } from "../ActorContext";

interface MirrorEvidence {
  eventId: string;
  title: string;
  category: "strategic" | "operational" | "reactive";
  confidence: number;
  hours: number;
}

interface Mirror {
  totalHours: number;
  pctByCategory: Record<string, number>;
  avgConfidence: number;
  lowConfidenceShare: number;
  evidence: MirrorEvidence[];
  targetStrategicPct: number | null;
  gapVsTargetPct: number | null;
}

export default function StrategyMirrorPage() {
  const { actorId, actor } = useActor();
  const actorFetch = useActorFetch();
  const [mirror, setMirror] = useState<Mirror | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!actorId) return;
    actorFetch("/api/time-economics/strategy-mirror/self")
      .then((r) => r.json())
      .then((d) => (d.error ? setError(d.error) : setMirror(d.mirror)));
  }, [actorId, actorFetch]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="m-0 text-lg font-semibold text-slate-950">Strategy-Time Mirror</h2>
        <p className="mt-1 text-sm text-slate-600">
          For <strong>{actor?.name ?? "—"}</strong>: how your calendar classifies against strategic / operational / reactive time, with
          evidence and classification uncertainty shown on every line.
        </p>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      {mirror && (
        <>
          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <p className="m-0 text-3xl font-semibold text-slate-950">{mirror.pctByCategory.strategic}% strategic</p>
            <p className="mt-1 text-sm text-slate-600">
              out of {mirror.totalHours.toFixed(1)} classified hours.
              {mirror.targetStrategicPct !== null && (
                <>
                  {" "}
                  Target: {mirror.targetStrategicPct}% ({mirror.gapVsTargetPct !== null && mirror.gapVsTargetPct < 0 ? `${Math.abs(mirror.gapVsTargetPct)} pts below target` : `${mirror.gapVsTargetPct} pts vs target`}).
                </>
              )}
            </p>
            <div className="mt-4 flex gap-4 text-sm">
              <span>Operational: {mirror.pctByCategory.operational}%</span>
              <span>Reactive: {mirror.pctByCategory.reactive}%</span>
            </div>
            <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Average classification confidence: {mirror.avgConfidence} · {Math.round(mirror.lowConfidenceShare * 100)}% of hours were
              classified with confidence below 0.5 — treat those as uncertain, not settled fact.
            </p>
          </div>

          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <h3 className="m-0 mb-3 text-sm font-semibold">Evidence</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500">
                  <th className="py-1">Meeting</th>
                  <th>Category</th>
                  <th>Confidence</th>
                  <th>Hours</th>
                </tr>
              </thead>
              <tbody>
                {mirror.evidence.map((e) => (
                  <tr key={e.eventId} className="border-t border-slate-100">
                    <td className="py-1.5">{e.title}</td>
                    <td>
                      <CategoryBadge category={e.category} />
                    </td>
                    <td className={e.confidence < 0.5 ? "font-semibold text-amber-700" : ""}>{e.confidence.toFixed(2)}</td>
                    <td>{e.hours.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function CategoryBadge({ category }: { category: string }) {
  const colors: Record<string, string> = {
    strategic: "bg-emerald-100 text-emerald-700",
    operational: "bg-slate-100 text-slate-700",
    reactive: "bg-red-100 text-red-700",
  };
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${colors[category]}`}>{category}</span>;
}
