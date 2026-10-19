import { desc } from "drizzle-orm";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { ensureSeeded } from "@/lib/seed";
import { PageHeader, Panel, Badge, ProgressRing, StatTile } from "@/components/leados/ui";
import { DataTable, type ColumnDef } from "@/components/leados/ui/Table";
import { formatDate } from "@/components/leados/ui/utils";
import type { Severity } from "@/components/leados/ui/tokens";

export const dynamic = "force-dynamic";

type ProjectRow = typeof projects.$inferSelect;

const statusSeverity: Record<string, Severity> = {
  "on-track": "good",
  "at-risk": "caution",
  blocked: "critical",
  complete: "info",
};

export default async function StrategicPage({
  searchParams,
}: {
  searchParams: Promise<{ highlight?: string }>;
}) {
  await ensureSeeded();
  const { highlight } = await searchParams;
  const rows = await db.select().from(projects).orderBy(desc(projects.health));

  const atRisk = rows.filter((p) => p.status === "at-risk" || p.status === "blocked").length;
  const totalBudget = rows.reduce((sum, p) => sum + p.budgetTotal, 0);
  const totalSpent = rows.reduce((sum, p) => sum + p.budgetUsed, 0);

  const columns: ColumnDef<ProjectRow>[] = [
    {
      key: "name",
      header: "Strategic bet",
      render: (p) => (
        <span className={p.id === Number(highlight) ? "rounded bg-accent-subtle px-1 text-accent-subtle-text" : undefined}>{p.name}</span>
      ),
      sortValue: (p) => p.name,
    },
    { key: "owner", header: "Owner", render: (p) => p.owner, sortValue: (p) => p.owner },
    { key: "team", header: "Team", render: (p) => p.team, sortValue: (p) => p.team },
    {
      key: "health",
      header: "Health",
      render: (p) => (
        <div className="flex items-center gap-2">
          <ProgressRing value={p.health} size={36} stroke={4} severity={statusSeverity[p.status]} />
        </div>
      ),
      sortValue: (p) => p.health,
    },
    { key: "status", header: "Status", render: (p) => <Badge severity={statusSeverity[p.status]}>{p.status.replace("-", " ")}</Badge>, sortValue: (p) => p.status },
    {
      key: "budget",
      header: "Budget used",
      render: (p) => `${Math.round((p.budgetUsed / p.budgetTotal) * 100)}%`,
      sortValue: (p) => p.budgetUsed / p.budgetTotal,
      align: "right",
    },
    { key: "due", header: "Due", render: (p) => formatDate(p.dueDate), sortValue: (p) => p.dueDate.toString(), align: "right" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumbs={[{ label: "LEADOS", href: "/now" }, { label: "Act" }, { label: "Strategic" }]}
        title="Strategic"
        description="Portfolio health across every strategic bet currently in flight."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile label="Active bets" value={rows.length} icon="🧭" />
        <StatTile label="At risk or blocked" value={atRisk} deltaTone={atRisk > 2 ? "critical" : "neutral"} icon="⚠️" />
        <StatTile label="Portfolio budget used" value={`${Math.round((totalSpent / totalBudget) * 100)}%`} icon="💰" />
      </div>

      <Panel title="Portfolio" padded={false}>
        <div className="p-4">
          <DataTable
            caption="Strategic portfolio"
            columns={columns}
            rows={rows}
            rowKey={(p) => String(p.id)}
            searchable
            searchPlaceholder="Filter by name, owner or team…"
            filterRow={(p, q) => `${p.name} ${p.owner} ${p.team}`.toLowerCase().includes(q.toLowerCase())}
            initialSortKey="health"
          />
        </div>
      </Panel>
    </div>
  );
}
