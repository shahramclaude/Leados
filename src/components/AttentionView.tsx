import { useMemo, useState } from "react";
import { Card, Badge } from "./Shell";
import type { SignalState } from "../lib/store";
import { buildFindings } from "../lib/engine";
import { buildWeeklyAttentionPlan } from "../lib/attentionOpt";
import { PLAYBOOK_LABEL } from "../lib/playbooks";
import { CATEGORY_LABEL } from "../lib/types";
import { getCurrentProfile } from "../lib/circadian";
import { cn } from "../utils/cn";

const DAY_ORDER = ["Mon", "Tue", "Wed", "Thu", "Fri", "Next Week"];

export function AttentionView({ state }: { state: SignalState }) {
  const findings = useMemo(() => buildFindings(state), [state]);
  const circadian = useMemo(() => getCurrentProfile(), []);

  const [availableHours, setAvailableHours] = useState(30);
  const [maxCogLoad, setMaxCogLoad] = useState(Math.round(40 * circadian.analytical));
  const [iterations, setIterations] = useState(4000);
  const [runToken, setRunToken] = useState(0);

  const plan = useMemo(
    () =>
      buildWeeklyAttentionPlan(
        findings,
        state.runwayMonths,
        { availableHours, maxCogLoad, iterations },
        1000 + runToken
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [findings, state.runwayMonths, availableHours, maxCogLoad, iterations, runToken]
  );

  if (findings.length === 0) {
    return (
      <Card title="Attention Optimizer">
        <p className="text-sm text-slate-400">
          No active findings. Go to the Signal Board and toggle some on (or load the busy-week
          preset) to generate a weekly attention plan.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-white">Attention Optimizer</h1>
          <p className="text-sm text-slate-400">
            Simulated-annealing sequencing of your {findings.length} active findings against a
            finite weekly time and cognitive-load budget.
          </p>
        </div>
        <button
          onClick={() => setRunToken((t) => t + 1)}
          className="rounded-md bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500"
        >
          Re-run optimizer
        </button>
      </div>

      <Card title="Constraints this week" subtitle="Adjust your available hours and cognitive-load budget, then re-run.">
        <div className="grid gap-5 sm:grid-cols-3">
          <Slider label="Available hours" value={availableHours} min={5} max={50} step={1} suffix="h" onChange={setAvailableHours} />
          <Slider label="Cognitive-load budget" value={maxCogLoad} min={10} max={60} step={1} suffix="" onChange={setMaxCogLoad} />
          <Slider label="SA iterations" value={iterations} min={500} max={8000} step={500} suffix="" onChange={setIterations} />
        </div>
        <p className="mt-3 text-[11px] text-slate-500">
          Cognitive-load budget defaults to 40 × current circadian analytical capacity (
          {circadian.label}, ≈{Math.round(circadian.analytical * 100)}%) — a disclosed heuristic,
          not a measured value. See About / Provenance.
        </p>
      </Card>

      <div className="grid gap-4 sm:grid-cols-4">
        <Stat label="Total benefit" value={plan.totalBenefit.toFixed(1)} />
        <Stat label="Hours used" value={`${plan.totalHours} / ${availableHours}h`} sub={`${plan.utilizationHours}% utilization`} />
        <Stat label="Cognitive load used" value={`${plan.totalCogLoad} / ${maxCogLoad}`} sub={`${plan.utilizationCog}% utilization`} />
        <Stat label="Addressed / deferred" value={`${plan.sequence.length} / ${plan.deferred.length}`} />
      </div>

      <Card title="Weekly schedule">
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {DAY_ORDER.filter((d) => plan.scheduled[d]?.length).map((day) => (
            <div key={day} className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
              <div className="mb-2 text-xs font-semibold text-indigo-300">{day}</div>
              <div className="space-y-2">
                {plan.scheduled[day].map((item) => (
                  <div key={item.key} className="rounded border border-slate-800 bg-slate-950/60 p-2">
                    <div className="text-[11px] font-medium text-slate-200">{item.finding.rule}</div>
                    <div className="text-[11px] text-slate-500">{item.timeHours}h</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Optimized sequence" subtitle={plan.weekSummary}>
        <div className="space-y-2">
          {plan.sequence.map((item, i) => (
            <div key={item.key} className="flex flex-wrap items-center gap-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2">
              <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-xs font-semibold text-emerald-300">
                {i + 1}
              </span>
              <div className="min-w-[200px] flex-1">
                <div className="text-sm font-medium text-slate-100">
                  {item.finding.rule} · {item.finding.title}
                </div>
                <div className="text-[11px] text-slate-500">
                  {CATEGORY_LABEL[item.finding.category]}
                  {item.finding.person ? ` · ${item.finding.person}` : ""}
                  {item.playId ? ` · ${PLAYBOOK_LABEL[item.playId]}` : ""}
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Badge tone="indigo">ROI {item.roi.toFixed(2)}</Badge>
                <Badge tone="slate">{item.timeHours}h</Badge>
                <Badge tone="slate">load {item.cogLoad}</Badge>
                <Badge tone={item.urgency === 0 ? "rose" : item.urgency <= 3 ? "amber" : "slate"}>
                  {item.urgency === 0 ? "immediate" : `${item.urgency}d window`}
                </Badge>
              </div>
            </div>
          ))}
          {plan.sequence.length === 0 && <p className="text-sm text-slate-500">Nothing fit this week's budget.</p>}
        </div>
      </Card>

      {plan.deferred.length > 0 && (
        <Card title="Deferred" subtitle="Did not fit this week's time or cognitive-load budget, or had unmet dependencies.">
          <div className="space-y-1.5">
            {plan.deferred.map((item) => (
              <div key={item.key} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2 text-sm">
                <span className="text-slate-300">
                  {item.finding.rule} · {item.finding.title}
                </span>
                <div className="flex gap-1.5">
                  <Badge tone="slate">benefit {item.benefit.toFixed(1)}</Badge>
                  <Badge tone="slate">{item.timeHours}h</Badge>
                  {item.dependencies.length > 0 && <Badge tone="amber">needs {item.dependencies.join(", ")}</Badge>}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card title="Method note" className="border-dashed">
        <p className="text-xs leading-relaxed text-slate-400">{plan.label}</p>
      </Card>
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix: string;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-slate-400">{label}</span>
        <span className="font-medium text-slate-200">
          {value}
          {suffix}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-indigo-500"
      />
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className={cn("rounded-xl border border-slate-800 bg-slate-900/60 p-4")}>
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-semibold text-white">{value}</div>
      {sub && <div className="text-[11px] text-slate-500">{sub}</div>}
    </div>
  );
}
