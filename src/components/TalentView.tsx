"use client";

import { useEffect, useState } from "react";
import { useActor, actorFetch } from "@/lib/actorContext";
import { BulletGraph } from "./charts/BulletGraph";
import { ExplainPanel } from "./ExplainPanel";
import type { Explain } from "@/lib/explain";

interface CandidateReadiness {
  personId: string;
  name: string;
  readiness: Explain<"ready_now" | "ready_later" | "not_ready">;
  coverage: number;
  estimatedMonthsToReady: number | null;
  gaps: { skillName: string; currentLevel: number; requiredLevel: number; gap: number }[];
}

interface SuccessionMatrix {
  role: string;
  readyNow: CandidateReadiness[];
  readyLater: CandidateReadiness[];
  notReady: CandidateReadiness[];
  benchStrength: { readyNowCount: number; coverageRisk: "low" | "medium" | "high"; rationale: string };
  disclaimer: string;
}

const RISK_COLORS: Record<string, string> = {
  low: "bg-emerald-100 text-emerald-700",
  medium: "bg-amber-100 text-amber-700",
  high: "bg-rose-100 text-rose-700",
};

function Candidate({ c }: { c: CandidateReadiness }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <button className="flex w-full items-center justify-between text-left" onClick={() => setOpen((o) => !o)}>
        <span className="font-medium text-slate-800">{c.name}</span>
        <span className="text-xs text-slate-500">
          {(c.coverage * 100).toFixed(0)}% coverage
          {c.estimatedMonthsToReady !== null && c.estimatedMonthsToReady > 0 ? ` · ~${c.estimatedMonthsToReady}mo` : ""}
        </span>
      </button>
      <BulletGraph value={c.coverage} formatAsPercent />
      {open && (
        <div className="mt-2 space-y-2">
          {c.gaps.length > 0 && (
            <div className="text-xs text-slate-600">
              Gaps: {c.gaps.map((g) => `${g.skillName} (${g.currentLevel}/${g.requiredLevel})`).join(", ")}
            </div>
          )}
          <ExplainPanel explain={c.readiness} />
        </div>
      )}
    </div>
  );
}

export function TalentView() {
  const { currentActorId } = useActor();
  const [role, setRole] = useState("Senior Engineer");
  const [matrix, setMatrix] = useState<SuccessionMatrix | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!currentActorId || !role) return;
    setMatrix(null);
    setError(null);
    actorFetch(currentActorId, `/api/succession/${encodeURIComponent(role)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error ?? "Failed to load succession matrix");
        return r.json();
      })
      .then(setMatrix)
      .catch((e) => setError(e.message));
  }, [currentActorId, role]);

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <label htmlFor="role" className="text-sm text-slate-600">
          Key role
        </label>
        <select
          id="role"
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className="rounded-md border border-slate-300 px-2 py-1 text-sm"
        >
          <option>Senior Engineer</option>
          <option>Engineering Manager</option>
          <option>Product Manager</option>
          <option>Designer</option>
        </select>
      </div>

      {error && <p className="text-sm text-rose-600">{error}</p>}

      {matrix && (
        <>
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            {matrix.disclaimer}
          </div>
          <div className="mb-4 flex items-center gap-2">
            <span className="text-sm text-slate-600">Bench coverage risk:</span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${RISK_COLORS[matrix.benchStrength.coverageRisk]}`}>
              {matrix.benchStrength.coverageRisk}
            </span>
            <span className="text-xs text-slate-500">{matrix.benchStrength.rationale}</span>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <h3 className="mb-2 text-sm font-semibold text-slate-900">Ready now ({matrix.readyNow.length})</h3>
              <div className="space-y-2">
                {matrix.readyNow.map((c) => (
                  <Candidate key={c.personId} c={c} />
                ))}
              </div>
            </div>
            <div>
              <h3 className="mb-2 text-sm font-semibold text-slate-900">Ready later ({matrix.readyLater.length})</h3>
              <div className="space-y-2">
                {matrix.readyLater.map((c) => (
                  <Candidate key={c.personId} c={c} />
                ))}
              </div>
            </div>
            <div>
              <h3 className="mb-2 text-sm font-semibold text-slate-900">Not ready ({matrix.notReady.length})</h3>
              <div className="space-y-2">
                {matrix.notReady.slice(0, 5).map((c) => (
                  <Candidate key={c.personId} c={c} />
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
