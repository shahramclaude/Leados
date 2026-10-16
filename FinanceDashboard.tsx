import { BulletGraph, LineChart, Sparkline, Waterfall, CohortGrid } from "../viz";
import {
  marginBullet,
  revenueBullet,
  ebitdaBullet,
  grossMarginSeries,
  burnRateSeries,
  unitEconomics,
  riskRegister,
  plWaterfall,
  cohortRows,
  kpiTable,
  runway,
  ruleOf40,
} from "../viz/sampleData";

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-white p-4" style={{ borderColor: "var(--line)" }}>
      <h3 className="mb-2 font-semibold" style={{ fontSize: "var(--text-sm)" }}>
        {title}
      </h3>
      {children}
    </div>
  );
}

const sevColor: Record<number, string> = {
  1: "var(--sev-1)",
  2: "var(--sev-2)",
  3: "var(--sev-3)",
  4: "var(--sev-4)",
  5: "var(--sev-5)",
};

export function FinanceDashboard() {
  const rule40 = ruleOf40.growth + ruleOf40.profitMargin;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* LEFT COLUMN */}
        <div className="space-y-4">
          <Panel title="P&L: revenue / gross margin / EBITDA">
            <div className="space-y-5">
              <BulletGraph metric={revenueBullet} meta={{ source: "fin.pl.logged, n=1 qtr", confidence: "high", label: "Revenue vs target" }} />
              <BulletGraph metric={marginBullet} meta={{ source: "fin.pl.logged, n=1 qtr", confidence: "high", label: "Gross margin vs target" }} />
              <BulletGraph metric={ebitdaBullet} meta={{ source: "fin.pl.logged, n=1 qtr", confidence: "medium", label: "EBITDA margin vs target" }} />
            </div>
          </Panel>

          <Panel title="Runway">
            <div className="flex items-end gap-3">
              <span className="font-mono-ui" style={{ fontSize: 34, color: runway.months < 9 ? "var(--sev-5)" : "var(--ink-1)" }}>
                {runway.months}
              </span>
              <span className="mb-1 font-mono-ui" style={{ fontSize: "var(--text-xs)", color: "var(--ink-2)" }}>
                months · cash-out {runway.cashOut}
              </span>
            </div>
            <p className="mt-1 font-mono-ui" style={{ fontSize: "var(--text-2xs)", color: "var(--ink-2)" }}>
              fin.cash.logged · high · days-to-action: 14 (board must see this by next meeting)
            </p>
          </Panel>

          <Panel title="Rule of 40">
            <div className="h-5 w-full overflow-hidden rounded" style={{ background: "var(--surface-3)" }}>
              <div
                className="h-full"
                style={{
                  width: `${Math.min(100, (rule40 / 40) * 100)}%`,
                  background: rule40 >= 40 ? "var(--sev-1)" : "var(--sev-4)",
                }}
              />
            </div>
            <p className="mt-1 font-mono-ui" style={{ fontSize: "var(--text-xs)", color: "var(--ink-1)" }}>
              growth {ruleOf40.growth}% + margin {ruleOf40.profitMargin}% = {rule40}% (floor: 40%)
            </p>
            <p className="font-mono-ui" style={{ fontSize: "var(--text-2xs)", color: "var(--ink-2)" }}>
              fin.pl.logged · medium · composite of trailing-12mo growth and margin
            </p>
          </Panel>
        </div>

        {/* RIGHT COLUMN */}
        <div className="space-y-4">
          <Panel title="Gross margin (8 periods)">
            <Sparkline points={grossMarginSeries[0].points.map((p) => p.y ?? 0)} type="area" size="extended" unit="%" color="var(--domain-finance)" label="gross margin" />
          </Panel>

          <Panel title="Unit economics by segment">
            <table className="w-full font-mono-ui" style={{ fontSize: "var(--text-xs)" }}>
              <thead>
                <tr style={{ color: "var(--ink-2)" }}>
                  <th className="text-left font-normal">segment</th>
                  <th className="text-right font-normal">LTV:CAC</th>
                  <th className="text-right font-normal">CAC</th>
                  <th className="text-right font-normal">payback</th>
                </tr>
              </thead>
              <tbody>
                {unitEconomics.map((u) => (
                  <tr key={u.segment} style={{ borderTop: "1px solid var(--surface-2)" }}>
                    <td className="py-1">{u.segment}</td>
                    <td className="text-right" style={{ color: u.ltvCac < 3 ? "var(--sev-4)" : "var(--sev-1)" }}>
                      {u.ltvCac.toFixed(1)}
                    </td>
                    <td className="text-right">${u.cac.toLocaleString()}</td>
                    <td className="text-right">{u.paybackMo}mo</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-1 font-mono-ui" style={{ fontSize: "var(--text-2xs)", color: "var(--ink-3)" }}>
              sales.deal.logged + fin.pl.logged · medium · n=3 segments
            </p>
          </Panel>

          <Panel title="Burn rate (12 months)">
            <LineChart series={burnRateSeries} options={{ yLabel: "$k/mo" }} meta={{ source: "fin.cash.logged, n=12 months", confidence: "high", label: "Monthly net burn" }} />
          </Panel>
        </div>
      </div>

      {/* BELOW FOLD */}
      <Panel title="Risk register">
        <table className="w-full font-mono-ui" style={{ fontSize: "var(--text-xs)" }}>
          <thead>
            <tr style={{ color: "var(--ink-2)" }}>
              <th className="text-left font-normal">risk</th>
              <th className="text-left font-normal">sev</th>
              <th className="text-left font-normal">owner</th>
              <th className="text-left font-normal">status</th>
            </tr>
          </thead>
          <tbody>
            {riskRegister.map((r) => (
              <tr key={r.risk} style={{ borderTop: "1px solid var(--surface-2)" }}>
                <td className="py-1">{r.risk}</td>
                <td>
                  <span className="inline-block h-2 w-2 rounded-full" style={{ background: sevColor[r.severity] }} /> {r.severity}
                </td>
                <td>{r.owner}</td>
                <td style={{ color: "var(--ink-2)" }}>{r.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-1 font-mono-ui" style={{ fontSize: "var(--text-2xs)", color: "var(--ink-3)" }}>
          engine.findings (risk-tagged) · medium · n=4 open risks
        </p>
      </Panel>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="Budget variance (current period)">
          <Waterfall items={plWaterfall} meta={{ source: "fin.pl.logged, n=1 period", confidence: "high", label: "Revenue to EBITDA bridge" }} />
        </Panel>
        <Panel title="Cohort retention (last 4 cohorts)">
          <CohortGrid rows={cohortRows} meta={{ source: "fin.cohort.logged · source: your logged data", confidence: "medium", label: "Retention by signup cohort" }} />
        </Panel>
      </div>

      <Panel title="KPI table">
        <table className="w-full font-mono-ui" style={{ fontSize: "var(--text-xs)" }}>
          <thead>
            <tr style={{ color: "var(--ink-2)" }}>
              <th className="text-left font-normal">KPI</th>
              <th className="text-left font-normal">value</th>
              <th className="text-left font-normal">8-period trend</th>
            </tr>
          </thead>
          <tbody>
            {kpiTable.map((k) => (
              <tr key={k.kpi} style={{ borderTop: "1px solid var(--surface-2)" }}>
                <td className="py-1.5">{k.kpi}</td>
                <td>{k.value}</td>
                <td>
                  <Sparkline points={k.trend} type="line" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-1 font-mono-ui" style={{ fontSize: "var(--text-2xs)", color: "var(--ink-3)" }}>
          fin.pl.logged + sales.deal.logged + people.headcount.logged · medium · n=8 periods per row
        </p>
      </Panel>
    </div>
  );
}
