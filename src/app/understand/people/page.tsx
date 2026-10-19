import { asc } from "drizzle-orm";
import { db } from "@/db";
import { people } from "@/db/schema";
import { ensureSeeded } from "@/lib/seed";
import { PageHeader, StatTile, Panel, Badge, ChartFrame, HeatmapSVG } from "@/components/leados/ui";
import { DataTable, type ColumnDef } from "@/components/leados/ui/Table";
import { ProgressBar } from "@/components/leados/ui/Primitives";
import { formatPercent } from "@/components/leados/ui/utils";
import type { Severity } from "@/components/leados/ui/tokens";

export const dynamic = "force-dynamic";

type PersonRow = typeof people.$inferSelect;

function flightRiskSeverity(risk: number): Severity {
  if (risk >= 0.66) return "critical";
  if (risk >= 0.4) return "warning";
  return "good";
}

export default async function PeoplePage({
  searchParams,
}: {
  searchParams: Promise<{ highlight?: string }>;
}) {
  await ensureSeeded();
  const { highlight } = await searchParams;
  const rows = await db.select().from(people).orderBy(asc(people.team), asc(people.name));

  const avgSentiment = rows.reduce((sum, p) => sum + p.sentiment, 0) / rows.length;
  const avgEngagement = rows.reduce((sum, p) => sum + p.engagement, 0) / rows.length;
  const highRisk = rows.filter((p) => p.flightRisk >= 0.6).length;

  const teams = Array.from(new Set(rows.map((p) => p.team))).sort();
  const heatValues = teams.map((team) => {
    const teamRows = rows.filter((p) => p.team === team);
    const sentiment = teamRows.reduce((sum, p) => sum + p.sentiment, 0) / teamRows.length;
    return [Math.round(sentiment * 100)];
  });

  const columns: ColumnDef<PersonRow>[] = [
    { key: "name", header: "Name", render: (p) => (p.id === Number(highlight) ? <mark className="rounded bg-accent-subtle px-1 text-accent-subtle-text">{p.name}</mark> : p.name), sortValue: (p) => p.name },
    { key: "role", header: "Role", render: (p) => p.role, sortValue: (p) => p.role },
    { key: "team", header: "Team", render: (p) => p.team, sortValue: (p) => p.team },
    { key: "tenure", header: "Tenure", render: (p) => `${p.tenureMonths} mo`, sortValue: (p) => p.tenureMonths, align: "right" },
    {
      key: "sentiment",
      header: "Sentiment",
      render: (p) => <ProgressBar value={p.sentiment * 100} severity={p.sentiment > 0.6 ? "good" : p.sentiment > 0.4 ? "caution" : "critical"} />,
      sortValue: (p) => p.sentiment,
      width: "160px",
    },
    {
      key: "flightRisk",
      header: "Flight risk",
      render: (p) => <Badge severity={flightRiskSeverity(p.flightRisk)}>{formatPercent(p.flightRisk)}</Badge>,
      sortValue: (p) => p.flightRisk,
      align: "right",
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumbs={[{ label: "LEADOS", href: "/now" }, { label: "Understand" }, { label: "People" }]}
        title="People"
        description="Sentiment, engagement and flight risk across every team, refreshed from the latest check-ins."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile label="Average sentiment" value={formatPercent(avgSentiment)} icon="🙂" />
        <StatTile label="Average engagement" value={formatPercent(avgEngagement)} icon="⚡" />
        <StatTile label="High flight risk" value={highRisk} caption="people ≥ 60% risk" deltaTone={highRisk > 3 ? "critical" : "neutral"} icon="🚩" />
      </div>

      <Panel title="Sentiment by team">
        <ChartFrame
          title="Average sentiment by team"
          description="Higher is better — derived from the latest 1:1 and pulse-survey check-ins."
          table={{
            columns: [
              { key: "team", header: "Team", render: (r: { team: string; value: number }) => r.team },
              { key: "value", header: "Sentiment", render: (r: { team: string; value: number }) => formatPercent(r.value / 100), align: "right" },
            ],
            rows: teams.map((team, i) => ({ team, value: heatValues[i][0] })),
            rowKey: (r) => r.team,
          }}
        >
          <HeatmapSVG rows={teams} cols={["Sentiment"]} values={heatValues} valueLabel={(v) => `${v}%`} />
        </ChartFrame>
      </Panel>

      <Panel title="All people" description="Sortable and filterable — matches the command palette's people search." padded={false}>
        <div className="p-4">
          <DataTable
            caption="People directory"
            columns={columns}
            rows={rows}
            rowKey={(p) => String(p.id)}
            searchable
            searchPlaceholder="Filter by name, role or team…"
            filterRow={(p, q) => `${p.name} ${p.role} ${p.team}`.toLowerCase().includes(q.toLowerCase())}
            initialSortKey="flightRisk"
          />
        </div>
      </Panel>
    </div>
  );
}
