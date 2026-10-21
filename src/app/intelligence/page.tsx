"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { InsightCard } from "@/components/intelligence/InsightCard";
import { ConfidenceChip } from "@/components/intelligence/ConfidenceBar";
import { Explain } from "@/lib/intelligence/types";

interface ForecastsResponse {
  completionRate: Explain<number>;
  cycleTime: Explain<number>;
  engagementDrift: Explain<number>;
}

interface DecisionRow {
  decisionId: string;
  title: string;
  description?: string;
  ev: Record<string, number>;
  bestActionId: string;
  bestEv: number;
  regret: Record<string, number>;
  voiBySource: { sourceId: string; label: string; cost: number; voi: number; netValue: number }[];
  maxVoi: number;
  highVoiFlag: boolean;
  actions?: { id: string; label: string }[];
  stateConfidenceClass?: string;
}

interface CalibrationLatest {
  generatedAt: string;
  binary: { n: number; brierScore: number; logLoss: number; ece: number };
  rateCoverage80: number;
  levelMeanCoverage80: number;
  gates: { brierOk: boolean; eceOk: boolean; rateCoverageOk: boolean; levelCoverageOk: boolean; allOk: boolean };
}

type JobStatus = "idle" | "running" | "done" | "cancelled" | "error";

interface SimJobState {
  jobId: string;
  status: JobStatus;
  progress: { completedPairs: number; totalPairs: number };
  strategyUsed?: string;
  probExceed?: Explain<number>;
  expectedOverrun?: Explain<number>;
  groundTruth?: { muT: number; sigmaT: number; probExceed: number; expectedOverrun: number };
}

export default function IntelligenceDashboard() {
  const [forecasts, setForecasts] = useState<ForecastsResponse | null>(null);
  const [decisions, setDecisions] = useState<DecisionRow[] | null>(null);
  const [calibration, setCalibration] = useState<CalibrationLatest | null>(null);
  const [calibrationError, setCalibrationError] = useState<string | null>(null);
  const [job, setJob] = useState<SimJobState | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetch("/api/forecasts")
      .then((r) => r.json())
      .then(setForecasts)
      .catch(() => {});
    fetch("/api/decisions")
      .then((r) => r.json())
      .then((d) => setDecisions(d.decisions))
      .catch(() => {});
    fetch("/api/calibration/latest")
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json();
          setCalibrationError(body.error ?? "Unavailable");
          return;
        }
        setCalibration(await r.json());
      })
      .catch(() => setCalibrationError("Unavailable"));
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  function startSimulation() {
    fetch("/api/simulate", { method: "POST", body: JSON.stringify({ totalPairs: 20000 }) })
      .then((r) => r.json())
      .then((data: { jobId: string }) => {
        setJob({ jobId: data.jobId, status: "running", progress: { completedPairs: 0, totalPairs: 20000 } });
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = setInterval(() => pollJob(data.jobId), 400);
      });
  }

  function pollJob(jobId: string) {
    fetch(`/api/simulate?jobId=${jobId}`)
      .then((r) => r.json())
      .then((data: SimJobState) => {
        setJob(data);
        if (data.status !== "running" && pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      });
  }

  function cancelSimulation() {
    if (!job) return;
    fetch(`/api/simulate?jobId=${job.jobId}`, { method: "DELETE" });
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-sm uppercase tracking-wide text-slate-500">LEADOS</p>
          <h1 className="text-3xl font-semibold text-slate-950">Decision Intelligence Briefing</h1>
        </div>
        <Link href="/model-cards" className="text-sm font-medium text-sky-700 hover:underline">
          Model cards →
        </Link>
      </header>
      <p className="mt-2 max-w-3xl text-slate-600">
        Every number below is wrapped in an <code>Explain&lt;T&gt;</code> envelope: an interval, a confidence class,
        and a link to the model card that produced it. Nothing here is a bare point estimate.
      </p>

      {/* Forecasts */}
      <section className="mt-8">
        <h2 className="text-lg font-semibold text-slate-900">Forecasts (intervals, not point estimates)</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {forecasts ? (
            <>
              <InsightCard
                title="Task completion rate"
                explain={forecasts.completionRate}
                domain={[0, 1]}
                formatValue={(v) => `${(v * 100).toFixed(1)}%`}
              />
              <InsightCard title="Cycle time" explain={forecasts.cycleTime} unit="days" formatValue={(v) => v.toFixed(1)} />
              <InsightCard
                title="Weekly engagement (EWMA)"
                explain={forecasts.engagementDrift}
                formatValue={(v) => v.toFixed(1)}
              />
            </>
          ) : (
            <p className="text-sm text-slate-400">Loading forecasts…</p>
          )}
        </div>
      </section>

      {/* Decisions */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold text-slate-900">Pending decisions — ranked by Value of Information</h2>
        <p className="mt-1 text-sm text-slate-500">
          High VOI means &ldquo;what you&apos;d learn would plausibly change the action&rdquo; — those decisions are flagged.
        </p>
        <div className="mt-4 space-y-4">
          {decisions ? (
            decisions.map((d) => (
              <div key={d.decisionId} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-base font-semibold text-slate-900">{d.title}</h3>
                  <div className="flex items-center gap-2">
                    {d.stateConfidenceClass && <ConfidenceChip confidenceClass={d.stateConfidenceClass as "assumed"} />}
                    {d.highVoiFlag && (
                      <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
                        High VOI — gather info first
                      </span>
                    )}
                  </div>
                </div>
                {d.description && <p className="mt-1 text-sm text-slate-600">{d.description}</p>}
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  <div>
                    <p className="text-xs font-medium uppercase text-slate-500">Expected value by action</p>
                    <ul className="mt-1 space-y-1 text-sm">
                      {Object.entries(d.ev).map(([actionId, ev]) => (
                        <li key={actionId} className="flex justify-between">
                          <span className={actionId === d.bestActionId ? "font-semibold text-emerald-700" : "text-slate-700"}>
                            {d.actions?.find((a) => a.id === actionId)?.label ?? actionId}
                            {actionId === d.bestActionId ? " (best)" : ""}
                          </span>
                          <span className="tabular-nums">
                            ${ev.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                          </span>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-2 text-xs text-slate-500">
                      Regret if wrong:{" "}
                      {Object.entries(d.regret)
                        .map(([a, r]) => `${d.actions?.find((x) => x.id === a)?.label ?? a}: $${r.toLocaleString(undefined, { maximumFractionDigits: 0 })}`)
                        .join(" · ")}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase text-slate-500">What would change this decision</p>
                    <ul className="mt-1 space-y-1 text-sm text-slate-700">
                      {d.voiBySource.map((v) => (
                        <li key={v.sourceId} className="flex justify-between gap-2">
                          <span>{v.label}</span>
                          <span className="tabular-nums">
                            VOI ${v.voi.toLocaleString(undefined, { maximumFractionDigits: 0 })} − cost $
                            {v.cost.toLocaleString(undefined, { maximumFractionDigits: 0 })} = net $
                            {v.netValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <p className="text-sm text-slate-400">Loading decisions…</p>
          )}
        </div>
      </section>

      {/* Monte Carlo */}
      <section className="mt-10 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Monte Carlo: quarterly project cost risk</h2>
        <p className="mt-1 text-sm text-slate-600">
          Seeded PRNG, antithetic + control variates, worker-pool parallelized, with a 2% relative-error convergence
          target.
        </p>
        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={startSimulation}
            disabled={job?.status === "running"}
            className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50"
          >
            Run simulation (20,000 pairs)
          </button>
          {job?.status === "running" && (
            <button
              type="button"
              onClick={cancelSimulation}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
          )}
          {job && (
            <span className="text-xs text-slate-500">
              {job.status} — {job.progress.completedPairs.toLocaleString()} / {job.progress.totalPairs.toLocaleString()} pairs
              {job.strategyUsed ? ` (${job.strategyUsed})` : ""}
            </span>
          )}
        </div>
        {job?.status === "running" && (
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-2 rounded-full bg-sky-500 transition-all"
              style={{ width: `${Math.min(100, (job.progress.completedPairs / Math.max(1, job.progress.totalPairs)) * 100)}%` }}
            />
          </div>
        )}
        {job?.status === "done" && job.probExceed && job.expectedOverrun && (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <InsightCard
              title="P(cost exceeds budget)"
              explain={job.probExceed}
              formatValue={(v) => `${(v * 100).toFixed(1)}%`}
            />
            <InsightCard title="Expected overrun" explain={job.expectedOverrun} unit="$" formatValue={(v) => `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} />
          </div>
        )}
        {job?.status === "done" && job.groundTruth && (
          <p className="mt-2 text-xs text-slate-400">
            Analytic ground truth (closed-form, since inputs are Normal): P(exceed)=
            {(job.groundTruth.probExceed * 100).toFixed(1)}%, expected overrun=$
            {job.groundTruth.expectedOverrun.toLocaleString(undefined, { maximumFractionDigits: 0 })}.
          </p>
        )}
      </section>

      {/* Calibration */}
      <section className="mt-10 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Calibration scorecard</h2>
        <p className="mt-1 text-sm text-slate-600">
          Produced by <code>npm run eval:intelligence</code>. Reliability diagrams are written as CSV/text artifacts
          under <code>reports/</code>.
        </p>
        {calibration ? (
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <ScoreStat label="Brier score" value={calibration.binary.brierScore.toFixed(3)} ok={calibration.gates.brierOk} target="≤ 0.15" />
            <ScoreStat label="ECE" value={calibration.binary.ece.toFixed(3)} ok={calibration.gates.eceOk} target="≤ 0.05" />
            <ScoreStat
              label="Rate interval coverage (80%)"
              value={`${(calibration.rateCoverage80 * 100).toFixed(1)}%`}
              ok={calibration.gates.rateCoverageOk}
              target="75–85%"
            />
            <ScoreStat
              label="Level mean coverage (80%)"
              value={`${(calibration.levelMeanCoverage80 * 100).toFixed(1)}%`}
              ok={calibration.gates.levelCoverageOk}
              target="70–90%"
            />
          </div>
        ) : (
          <p className="mt-3 text-sm text-rose-700">{calibrationError ?? "Loading…"}</p>
        )}
      </section>
    </main>
  );
}

function ScoreStat({ label, value, ok, target }: { label: string; value: string; ok: boolean; target: string }) {
  return (
    <div className={`rounded-xl p-3 ${ok ? "bg-emerald-50" : "bg-rose-50"}`}>
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`text-xl font-semibold ${ok ? "text-emerald-700" : "text-rose-700"}`}>{value}</p>
      <p className="text-[11px] text-slate-400">target {target}</p>
    </div>
  );
}
