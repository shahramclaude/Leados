import { useMemo } from "react";
import { runHealthChecks } from "../lib/health";

export function HealthView() {
  const checks = useMemo(() => runHealthChecks(), []);
  const passCount = checks.filter((c) => c.pass).length;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-100">Health</h1>
        <p className="text-sm text-slate-500">
          {passCount}/{checks.length} checks passing. Every row below is a live computation, not a
          hard-coded status.
        </p>
      </div>

      <div className="space-y-2">
        {checks.map((c) => (
          <div
            key={c.id}
            className={`rounded-lg border p-3 flex items-start gap-3 ${
              c.pass ? "border-emerald-900 bg-emerald-950/30" : "border-rose-900 bg-rose-950/30"
            }`}
          >
            <span className={`mt-0.5 text-sm ${c.pass ? "text-emerald-400" : "text-rose-400"}`}>{c.pass ? "\u2713" : "\u2717"}</span>
            <div>
              <div className="text-sm font-medium text-slate-200">
                {c.id} &mdash; {c.label}
              </div>
              <div className="text-xs text-slate-500 font-mono">{c.detail}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
