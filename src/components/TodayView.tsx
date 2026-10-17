import { useEffect, useState } from "react";
import { Card } from "./Card";
import { getProfileForDate } from "../lib/circadian";
import type { AppEvent } from "../lib/types";

export function TodayView({
  events,
  onLogStyle,
}: {
  events: AppEvent[];
  onLogStyle: (style: "plan" | "direct") => void;
}) {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);
  const profile = getProfileForDate(now);
  const decisions = events.filter((e) => e.type === "decision.logged").length;
  const simulations = events.filter((e) => e.type === "simulation.run").length;

  return (
    <div className="space-y-6">
      <Card title="Right now">
        <div className="flex flex-wrap items-center gap-4">
          <div className="text-3xl font-mono">{now.toLocaleTimeString()}</div>
          <div className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white">{profile.label}</div>
        </div>
        <p className="mt-3 max-w-2xl text-sm text-slate-600">{profile.note}</p>
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-2">
          <Meter label="Analytical capacity (heuristic)" value={profile.analytical} />
          <Meter label="Working memory (heuristic)" value={profile.workingMemory} />
        </div>
        <p className="mt-3 text-xs text-slate-400">
          Heuristic estimate from time-of-day only — not personalized, not a diagnosis. See Accessibility/About for
          sourcing notes.
        </p>
      </Card>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
        <Card title="Decisions logged">
          <div className="text-3xl font-semibold">{decisions}</div>
        </Card>
        <Card title="Simulations run">
          <div className="text-3xl font-semibold">{simulations}</div>
        </Card>
        <Card title="Total events">
          <div className="text-3xl font-semibold">{events.length}</div>
        </Card>
      </div>

      <Card title="Quick behavioral log (feeds the Genome heuristic)">
        <p className="mb-3 text-sm text-slate-600">
          Tag the leadership move you just made. Used only to compute a simple plans/directs ratio on the
          Memory &amp; Genome tab.
        </p>
        <div className="flex gap-3">
          <button
            onClick={() => onLogStyle("plan")}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
          >
            I coached / delegated a plan
          </button>
          <button
            onClick={() => onLogStyle("direct")}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            I gave a direct instruction
          </button>
        </div>
      </Card>
    </div>
  );
}

function Meter({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs text-slate-500">
        <span>{label}</span>
        <span className="font-mono">{Math.round(value * 100)}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div className="h-full bg-indigo-500 transition-all" style={{ width: `${value * 100}%` }} />
      </div>
    </div>
  );
}
