import { PageHeader, Panel, StatTile, ChartFrame, WaterfallSVG, ProgressBar } from "@/components/leados/ui";
import { generateFinancialWaterfall, generateBudgetRows } from "@/lib/engine";
import { formatCompact } from "@/components/leados/ui/utils";

export const dynamic = "force-dynamic";

export default function FinancialPage() {
  const waterfall = generateFinancialWaterfall();
  const budgetRows = generateBudgetRows();
  const endingArr = waterfall[waterfall.length - 1].delta;
  const startingArr = waterfall[0].delta;
  const netNewArr = endingArr - startingArr;
  const totalBudget = budgetRows.reduce((sum, r) => sum + r.budget, 0);
  const totalSpent = budgetRows.reduce((sum, r) => sum + r.spent, 0);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumbs={[{ label: "LEADOS", href: "/now" }, { label: "Act" }, { label: "Financial" }]}
        title="Financial"
        description="Revenue bridge, team budgets, and burn — the numbers behind every strategic and execution call."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile label="Ending ARR" value={`$${formatCompact(endingArr)}`} icon="💵" />
        <StatTile label="Net new ARR" value={`$${formatCompact(netNewArr)}`} delta={netNewArr >= 0 ? "+trending" : "declining"} deltaTone={netNewArr >= 0 ? "good" : "critical"} icon="📈" />
        <StatTile label="Org budget used" value={`${Math.round((totalSpent / totalBudget) * 100)}%`} icon="🏦" />
      </div>

      <Panel title="ARR bridge">
        <ChartFrame
          title="ARR bridge — this quarter"
          table={{
            columns: [
              { key: "label", header: "Step", render: (r: { label: string; delta: number }) => r.label },
              { key: "delta", header: "Amount", render: (r) => `$${formatCompact(r.delta)}`, align: "right" },
            ],
            rows: waterfall,
            rowKey: (r) => r.label,
          }}
        >
          <WaterfallSVG steps={waterfall} valueFormat={(v) => `$${formatCompact(v)}`} />
        </ChartFrame>
      </Panel>

      <Panel title="Budget by team" padded={false}>
        <div className="flex flex-col divide-y divide-border-subtle p-4">
          {budgetRows.map((row) => (
            <div key={row.team} className="flex flex-col gap-1.5 py-3 first:pt-0 last:pb-0">
              <div className="flex items-center justify-between text-body-sm">
                <span className="font-medium text-text-primary">{row.team}</span>
                <span className="text-text-tertiary">
                  ${formatCompact(row.spent)} / ${formatCompact(row.budget)} · {row.headcount} people
                </span>
              </div>
              <ProgressBar value={row.spent} max={row.budget} severity={row.spent / row.budget > 0.95 ? "critical" : row.spent / row.budget > 0.8 ? "caution" : "good"} />
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
