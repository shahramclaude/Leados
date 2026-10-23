import { db } from "@/db";
import * as s from "@/db/schema";
import { desc } from "drizzle-orm";
import { Card, Badge } from "@/components/Shell";
import { errorBudgetBurn } from "@/lib/calculations";

export const dynamic = "force-dynamic";

export default async function ObservabilityPage() {
  const slos = await db.select().from(s.sloDefinitions);
  const measurements = await db.select().from(s.sloMeasurements).orderBy(desc(s.sloMeasurements.measuredAt));

  const healthCheck = await fetch(
    process.env.NEXT_PUBLIC_BASE_URL ? `${process.env.NEXT_PUBLIC_BASE_URL}/api/health` : "http://127.0.0.1:3000/api/health",
    { cache: "no-store" }
  )
    .then((r) => r.json())
    .catch(() => ({ ok: false }));

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-indigo-600">Part 102</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-950">Observability &amp; SLO Automation</h1>
        <p className="mt-1 text-sm text-slate-600">
          SLOs as executable, queryable data with multi-window error-budget burn-rate computation (Google SRE
          formulation: burn = observed error / allowed error).
        </p>
      </header>

      <Card title="Live /api/health probe">
        <Badge tone={healthCheck.ok ? "green" : "red"}>{healthCheck.ok ? "healthy" : "unreachable"}</Badge>
      </Card>

      <Card title="SLO registry with live error-budget burn">
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase text-slate-400">
            <tr><th className="py-1.5">SLO</th><th>Indicator</th><th>Target</th><th>Measured</th><th>Burn rate</th><th>Budget remaining</th><th>Owner</th></tr>
          </thead>
          <tbody>
            {slos.map((slo) => {
              const m = measurements.find((x) => x.sloId === slo.id);
              const burn = m ? errorBudgetBurn(Number(slo.targetPct), Number(m.measuredPct), slo.windowDays) : null;
              return (
                <tr key={slo.id} className="border-t border-slate-100">
                  <td className="py-1.5">{slo.name}</td>
                  <td><Badge tone="slate">{slo.indicator}</Badge></td>
                  <td>{Number(slo.targetPct).toFixed(2)}%</td>
                  <td>{m ? `${Number(m.measuredPct).toFixed(2)}%` : "never-run"}</td>
                  <td>{burn ? burn.burnRate.toFixed(2) + "x" : "—"}</td>
                  <td>
                    {burn ? (
                      <Badge tone={burn.budgetRemainingPct > 50 ? "green" : burn.budgetRemainingPct > 10 ? "amber" : "red"}>
                        {burn.budgetRemainingPct.toFixed(0)}%
                      </Badge>
                    ) : "—"}
                  </td>
                  <td>{slo.owner}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      <Card title="Honest scope note">
        <p className="text-sm text-slate-600">
          This sandbox has no OpenTelemetry collector, log aggregator, or alert router wired to real infrastructure.
          SLO measurements above are recorded observations, not live-streaming telemetry. The <code>/governance</code>{" "}
          page records this as a <code>never-run</code> gate for full three-pillar observability rather than
          claiming it is implemented.
        </p>
      </Card>
    </div>
  );
}
