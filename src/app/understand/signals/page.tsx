import { PageHeader, Panel, Badge, ChartFrame, HeatmapSVG } from "@/components/leados/ui";
import { DataTable, type ColumnDef } from "@/components/leados/ui/Table";
import { generateSignals, type Signal } from "@/lib/engine";
import { formatDate } from "@/components/leados/ui/utils";

export const dynamic = "force-dynamic";

const trendIcon: Record<Signal["trend"], string> = { up: "▲", down: "▼", flat: "▬" };

export default function SignalsPage() {
  const signals = generateSignals();
  const sources = Array.from(new Set(signals.map((s) => s.source)));
  const severities = ["critical", "warning", "caution", "good", "info"] as const;

  const matrix = sources.map((source) =>
    severities.map((sev) => signals.filter((s) => s.source === source && s.severity === sev).length),
  );

  const columns: ColumnDef<Signal>[] = [
    {
      key: "title",
      header: "Signal",
      render: (s) => (
        <div>
          <p className="font-medium text-text-primary">{s.title}</p>
          <p className="text-caption text-text-tertiary">{s.summary}</p>
        </div>
      ),
      sortValue: (s) => s.title,
    },
    { key: "source", header: "Source", render: (s) => s.source, sortValue: (s) => s.source },
    {
      key: "trend",
      header: "Trend",
      render: (s) => (
        <span aria-label={`Trending ${s.trend}`} className="font-mono">
          {trendIcon[s.trend]}
        </span>
      ),
    },
    { key: "severity", header: "Severity", render: (s) => <Badge severity={s.severity}>{s.severity}</Badge>, sortValue: (s) => s.severity },
    { key: "detectedAt", header: "Detected", render: (s) => formatDate(s.detectedAt), sortValue: (s) => s.detectedAt, align: "right" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumbs={[{ label: "LEADOS", href: "/now" }, { label: "Understand" }, { label: "Signals" }]}
        title="Signals"
        description="Anomalies and emerging risks detected across support, product analytics, finance and the market scan."
      />

      <Panel title="Signal density by source and severity">
        <ChartFrame
          title="Signals by source × severity"
          table={{
            columns: [
              { key: "source", header: "Source", render: (r: { source: string; counts: number[] }) => r.source },
              ...severities.map((sev, i) => ({
                key: sev,
                header: sev,
                render: (r: { source: string; counts: number[] }) => r.counts[i],
                align: "right" as const,
              })),
            ],
            rows: sources.map((source, i) => ({ source, counts: matrix[i] })),
            rowKey: (r) => r.source,
          }}
        >
          <HeatmapSVG rows={sources} cols={[...severities]} values={matrix} valueLabel={(v) => String(v)} />
        </ChartFrame>
      </Panel>

      <Panel title="All signals" padded={false}>
        <div className="p-4">
          <DataTable
            caption="Detected signals"
            columns={columns}
            rows={signals}
            rowKey={(s) => s.id}
            searchable
            searchPlaceholder="Filter signals…"
            filterRow={(s, q) => `${s.title} ${s.source}`.toLowerCase().includes(q.toLowerCase())}
            initialSortKey="detectedAt"
          />
        </div>
      </Panel>
    </div>
  );
}
