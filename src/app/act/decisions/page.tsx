import { asc } from "drizzle-orm";
import { db } from "@/db";
import { decisions } from "@/db/schema";
import { ensureSeeded } from "@/lib/seed";
import { PageHeader, Panel, Badge, StatTile } from "@/components/leados/ui";
import { DataTable, type ColumnDef } from "@/components/leados/ui/Table";
import { formatDate } from "@/components/leados/ui/utils";
import type { Severity } from "@/components/leados/ui/tokens";
import { NewDecisionButton } from "./DecisionsClient";

export const dynamic = "force-dynamic";

type DecisionRow = typeof decisions.$inferSelect;

const statusSeverity: Record<string, Severity> = { pending: "warning", approved: "good", blocked: "critical" };

export default async function DecisionsPage({
  searchParams,
}: {
  searchParams: Promise<{ highlight?: string }>;
}) {
  await ensureSeeded();
  const { highlight } = await searchParams;
  const rows = await db.select().from(decisions).orderBy(asc(decisions.dueDate));

  const pending = rows.filter((d) => d.status === "pending").length;
  const blocked = rows.filter((d) => d.status === "blocked").length;

  const columns: ColumnDef<DecisionRow>[] = [
    {
      key: "title",
      header: "Decision",
      render: (d) => (
        <div>
          <p className={`font-medium text-text-primary ${d.id === Number(highlight) ? "rounded bg-accent-subtle px-1 text-accent-subtle-text" : ""}`}>{d.title}</p>
          <p className="mt-0.5 text-caption text-text-tertiary">{d.description}</p>
        </div>
      ),
      sortValue: (d) => d.title,
    },
    { key: "owner", header: "Owner", render: (d) => d.owner, sortValue: (d) => d.owner },
    { key: "severity", header: "Severity", render: (d) => <Badge severity={d.severity as Severity}>{d.severity}</Badge>, sortValue: (d) => d.severity },
    { key: "status", header: "Status", render: (d) => <Badge severity={statusSeverity[d.status]}>{d.status}</Badge>, sortValue: (d) => d.status },
    { key: "due", header: "Due", render: (d) => formatDate(d.dueDate), sortValue: (d) => d.dueDate.toString(), align: "right" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumbs={[{ label: "LEADOS", href: "/now" }, { label: "Act" }, { label: "Decisions" }]}
        title="Decisions"
        description="Every open decision awaiting a leadership call, newest deadline first."
        primaryAction={<NewDecisionButton />}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile label="Total open" value={rows.length} icon="✅" />
        <StatTile label="Pending" value={pending} deltaTone={pending > 3 ? "critical" : "neutral"} icon="⏳" />
        <StatTile label="Blocked" value={blocked} deltaTone={blocked > 0 ? "critical" : "good"} icon="🚫" />
      </div>

      <Panel title="All decisions" padded={false}>
        <div className="p-4">
          <DataTable
            caption="Open decisions"
            columns={columns}
            rows={rows}
            rowKey={(d) => String(d.id)}
            searchable
            searchPlaceholder="Filter by title or owner…"
            filterRow={(d, q) => `${d.title} ${d.owner}`.toLowerCase().includes(q.toLowerCase())}
            initialSortKey="due"
          />
        </div>
      </Panel>
    </div>
  );
}
