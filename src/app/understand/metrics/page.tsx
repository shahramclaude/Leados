import { PageHeader, Panel, StatTile, ChartFrame, LineSVG, GaugeArc } from "@/components/leados/ui";
import { generateMetricSeries, generateForecast } from "@/lib/engine";
import { formatCompact } from "@/components/leados/ui/utils";

export const dynamic = "force-dynamic";

export default function MetricsPage() {
  const revenue = generateMetricSeries(12, 420000, 0.06);
  const activeUsers = generateMetricSeries(12, 18000, 0.08);
  const forecast = generateForecast(12, 4200);
  const labels = Array.from({ length: 12 }).map((_, i) => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - 11 + i);
    return d.toLocaleDateString("en-US", { month: "short" });
  });

  const nps = 42;
  const csat = 88;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumbs={[{ label: "LEADOS", href: "/now" }, { label: "Understand" }, { label: "Metrics" }]}
        title="Metrics"
        description="Leading and lagging indicators, with Monte-Carlo-style forecast bands where the engine has enough history."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <StatTile label="MRR" value={`$${formatCompact(revenue[revenue.length - 1])}`} delta="+6.1%" deltaTone="good" icon="💵" />
        <StatTile label="Active users" value={formatCompact(activeUsers[activeUsers.length - 1])} delta="+3.4%" deltaTone="good" icon="👥" />
        <div className="flex items-center justify-center rounded-lg border border-border bg-surface-raised p-3">
          <GaugeArc value={nps} max={100} severity={nps > 30 ? "good" : "warning"} label="NPS" />
        </div>
        <div className="flex items-center justify-center rounded-lg border border-border bg-surface-raised p-3">
          <GaugeArc value={csat} max={100} severity="good" label="CSAT" />
        </div>
      </div>

      <Panel title="Revenue & active users">
        <ChartFrame
          title="Revenue and active users — trailing 12 months"
          legend={[
            { label: "Revenue ($)", color: "var(--chart-1)" },
            { label: "Active users", color: "var(--chart-2)" },
          ]}
          table={{
            columns: [
              { key: "month", header: "Month", render: (r: { month: string; revenue: number; users: number }) => r.month },
              { key: "revenue", header: "Revenue", render: (r) => `$${formatCompact(r.revenue)}`, align: "right" },
              { key: "users", header: "Active users", render: (r) => formatCompact(r.users), align: "right" },
            ],
            rows: labels.map((month, i) => ({ month, revenue: revenue[i], users: activeUsers[i] })),
            rowKey: (r) => r.month,
          }}
        >
          <LineSVG
            labels={labels}
            series={[
              { label: "Revenue ($)", color: "var(--chart-1)", points: revenue },
              { label: "Active users", color: "var(--chart-2)", points: activeUsers },
            ]}
          />
        </ChartFrame>
      </Panel>

      <Panel title="ARR forecast" description="Shaded band shows forecast uncertainty from the simulation cache.">
        <ChartFrame
          title="ARR — actuals and forward forecast"
          description="Solid line is the mean path; the band widens the further out the forecast runs."
          table={{
            columns: [
              { key: "month", header: "Month", render: (r: { month: string; mean: number; low: number; high: number }) => r.month },
              { key: "mean", header: "Forecast", render: (r) => `$${formatCompact(r.mean)}`, align: "right" },
              { key: "low", header: "Low", render: (r) => `$${formatCompact(r.low)}`, align: "right" },
              { key: "high", header: "High", render: (r) => `$${formatCompact(r.high)}`, align: "right" },
            ],
            rows: forecast.labels.map((month, i) => ({ month, mean: forecast.forecastMean[i], low: forecast.forecastBand[i].low, high: forecast.forecastBand[i].high })),
            rowKey: (r) => r.month,
          }}
        >
          <LineSVG
            labels={forecast.labels}
            yFormat={(v) => formatCompact(v)}
            series={[{ label: "ARR", color: "var(--chart-1)", points: forecast.forecastMean, band: forecast.forecastBand }]}
          />
        </ChartFrame>
      </Panel>
    </div>
  );
}
