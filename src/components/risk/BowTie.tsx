"use client";

import { useState } from "react";
import { betaCredibleInterval, betaMean, evidenceStrengthLabel, type BetaBelief } from "@/lib/beta";

export interface BowTieControl {
  riskControlId: number;
  controlCode: string;
  controlName: string;
  controlType: "preventive" | "detective" | "corrective";
  effectiveness: BetaBelief;
  lastTestedAt: string | null;
  nextTestDueAt: string;
}

export interface BowTieScenario {
  cause: string;
  event: string;
  consequence: string;
}

export function BowTie({ scenario, controls }: { scenario: BowTieScenario; controls: BowTieControl[] }) {
  const preventive = controls.filter((c) => c.controlType === "preventive");
  const reactive = controls.filter((c) => c.controlType !== "preventive");
  const [selected, setSelected] = useState<BowTieControl | null>(null);
  const [now] = useState(() => Date.now());

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6">
      <h3 className="text-lg font-semibold text-slate-950">Bow-tie view</h3>
      <p className="mt-1 text-sm text-slate-500">
        Click a barrier to see its effectiveness belief, evidence strength, and test status.
      </p>

      <div className="mt-6 grid grid-cols-1 items-center gap-4 lg:grid-cols-[1fr_auto_1fr_auto_1fr]">
        <ScenarioBox label="Cause" text={scenario.cause} tone="slate" />
        <BarrierStack title="Preventive barriers" controls={preventive} onSelect={setSelected} />
        <ScenarioBox label="Top event" text={scenario.event} tone="amber" emphasize />
        <BarrierStack title="Detective / corrective barriers" controls={reactive} onSelect={setSelected} />
        <ScenarioBox label="Consequence" text={scenario.consequence} tone="red" />
      </div>

      {selected && (
        <div className="mt-6 rounded-xl border border-slate-300 bg-slate-50 p-4">
          <BarrierDetail control={selected} />
        </div>
      )}
      {!selected && controls.length === 0 && (
        <p className="mt-6 text-sm text-amber-700">
          No controls are mapped to this risk yet — inherent and residual risk are currently identical.
        </p>
      )}
    </div>
  );
}

function ScenarioBox({ label, text, tone, emphasize }: { label: string; text: string; tone: "slate" | "amber" | "red"; emphasize?: boolean }) {
  const toneClasses = {
    slate: "border-slate-300 bg-slate-50",
    amber: "border-amber-400 bg-amber-50",
    red: "border-red-300 bg-red-50",
  }[tone];
  return (
    <div className={`rounded-xl border p-4 ${toneClasses} ${emphasize ? "font-semibold" : ""}`}>
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-sm text-slate-900">{text}</p>
    </div>
  );
}

function BarrierStack({ title, controls, onSelect }: { title: string; controls: BowTieControl[]; onSelect: (c: BowTieControl) => void }) {
  const now = Date.now();
  return (
    <div className="flex flex-col items-center gap-2">
      <p className="text-center text-xs font-medium uppercase tracking-wide text-slate-400">{title}</p>
      {controls.map((c) => {
        const overdue = new Date(c.nextTestDueAt).getTime() < now;
        const mean = betaMean(c.effectiveness);
        return (
          <button
            key={c.riskControlId}
            onClick={() => onSelect(c)}
            className={`w-32 rounded-lg border px-3 py-2 text-xs font-medium shadow-sm transition hover:-translate-y-0.5 ${
              overdue ? "border-red-400 bg-red-50 text-red-800" : "border-emerald-400 bg-emerald-50 text-emerald-800"
            }`}
            title={`${c.controlName}`}
          >
            {c.controlCode}
            <div className="mt-0.5 text-[10px] font-normal">{(mean * 100).toFixed(0)}% eff.</div>
            {overdue && <div className="mt-0.5 text-[10px] font-semibold">TEST OVERDUE</div>}
          </button>
        );
      })}
      {controls.length === 0 && <p className="text-center text-xs text-slate-400">— none mapped —</p>}
    </div>
  );
}

function BarrierDetail({ control }: { control: BowTieControl }) {
  const mean = betaMean(control.effectiveness);
  const ci = betaCredibleInterval(control.effectiveness, 0.9);
  const evidence = evidenceStrengthLabel(control.effectiveness);
  return (
    <div>
      <h4 className="font-semibold text-slate-900">
        {control.controlCode} — {control.controlName}
      </h4>
      <p className="text-xs uppercase tracking-wide text-slate-500">{control.controlType} barrier</p>
      <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-sm text-slate-700 sm:grid-cols-3">
        <div>
          <dt className="text-slate-400">Effectiveness (mean)</dt>
          <dd>{(mean * 100).toFixed(1)}%</dd>
        </div>
        <div>
          <dt className="text-slate-400">90% credible interval</dt>
          <dd>
            {(ci.low * 100).toFixed(1)}% – {(ci.high * 100).toFixed(1)}%
          </dd>
        </div>
        <div>
          <dt className="text-slate-400">Evidence strength</dt>
          <dd className="capitalize">{evidence}</dd>
        </div>
        <div>
          <dt className="text-slate-400">Last tested</dt>
          <dd>{control.lastTestedAt ? new Date(control.lastTestedAt).toLocaleString() : "never"}</dd>
        </div>
        <div>
          <dt className="text-slate-400">Next test due</dt>
          <dd>{new Date(control.nextTestDueAt).toLocaleString()}</dd>
        </div>
      </dl>
      {evidence === "thin" && (
        <p className="mt-2 text-xs italic text-amber-700">
          Evidence is thin (fewer than 5 test outcomes) — the interval above, not the mean, is the honest
          picture of what we know about this barrier.
        </p>
      )}
    </div>
  );
}
