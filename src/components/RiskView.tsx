import { project } from "../lib/engine";
import type { AppState } from "../lib/types";
import { DOMAIN_LABEL, DOMAINS } from "../lib/types";
import { BucketBadge, Card, SeverityBadge } from "./Shell";

export function RiskView({ state }: { state: AppState }) {
  const projection = project(state);
  const org = projection.findings.filter((f) => f.domain === "org");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Risk Register</h1>
        <p className="text-sm text-stone-500">
          All {DOMAINS.length} domains always shown, even at zero. Score = Σ severity-weight × 0.92<sup>ageDays</sup> over open findings in that domain.
        </p>
      </div>

      {org.length > 0 && (
        <Card title="Cross-domain amplification">
          <ul className="space-y-2">
            {org.map((f) => (
              <li key={f.key} className="flex items-start justify-between gap-4 rounded-lg bg-rose-50 p-3">
                <div>
                  <div className="text-sm font-medium text-rose-800">{f.title}</div>
                  <div className="text-xs text-rose-700">{f.detail}</div>
                </div>
                <SeverityBadge severity={f.severity} />
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {projection.domainScores.map((d) => {
          const findings = projection.findings.filter((f) => f.domain === d.domain);
          return (
            <Card key={d.domain}>
              <div className="mb-2 flex items-center justify-between">
                <div className="font-semibold">{DOMAIN_LABEL[d.domain]}</div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-mono text-stone-500">{d.score}</span>
                  <BucketBadge bucket={d.bucket} />
                </div>
              </div>
              {findings.length === 0 ? (
                <div className="py-3 text-center text-xs text-stone-400">No open findings</div>
              ) : (
                <ul className="space-y-2">
                  {findings.map((f) => (
                    <li key={f.key} className="rounded-lg border border-stone-100 p-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="text-sm font-medium">{f.title}</div>
                        <SeverityBadge severity={f.severity} />
                      </div>
                      <div className="mt-1 text-xs text-stone-500">{f.detail}</div>
                      <div className="mt-1 font-mono text-[11px] text-stone-400">{f.rule} · age {Math.round(f.ageDays)}d</div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
