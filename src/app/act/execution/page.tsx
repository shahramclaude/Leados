import { PageHeader, Panel, Badge, StatTile } from "@/components/leados/ui";
import { DataTable, type ColumnDef } from "@/components/leados/ui/Table";
import { generateExecutionItems, type ExecutionItem } from "@/lib/engine";
import { formatDate } from "@/components/leados/ui/utils";
import type { Severity } from "@/components/leados/ui/tokens";

export const dynamic = "force-dynamic";

const statusSeverity: Record<ExecutionItem["status"], Severity> = {
  "not-started": "neutral",
  "in-progress": "info",
  blocked: "critical",
  done: "good",
};

const priorityTone: Record<ExecutionItem["priority"], Severity> = { P0: "critical", P1: "warning", P2: "neutral" };

export default function ExecutionPage() {
  const items = generateExecutionItems();
  const blocked = items.filter((i) => i.status === "blocked").length;
  const inProgress = items.filter((i) => i.status === "in-progress").length;
  const done = items.filter((i) => i.status === "done").length;

  const columns: ColumnDef<ExecutionItem>[] = [
    { key: "title", header: "Item", render: (i) => i.title, sortValue: (i) => i.title },
    { key: "owner", header: "Owner", render: (i) => i.owner, sortValue: (i) => i.owner },
    { key: "priority", header: "Priority", render: (i) => <Badge severity={priorityTone[i.priority]}>{i.priority}</Badge>, sortValue: (i) => i.priority },
    { key: "status", header: "Status", render: (i) => <Badge severity={statusSeverity[i.status]}>{i.status.replace("-", " ")}</Badge>, sortValue: (i) => i.status },
    { key: "dueDate", header: "Due", render: (i) => formatDate(i.dueDate), sortValue: (i) => i.dueDate, align: "right" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumbs={[{ label: "LEADOS", href: "/now" }, { label: "Act" }, { label: "Execution" }]}
        title="Execution"
        description="Cross-team delivery status, surfaced so blockers never sit quietly for long."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile label="Blocked" value={blocked} deltaTone={blocked > 0 ? "critical" : "good"} icon="🚧" />
        <StatTile label="In progress" value={inProgress} icon="🔄" />
        <StatTile label="Done this cycle" value={done} deltaTone="good" icon="✅" />
      </div>

      <Panel title="All execution items" padded={false}>
        <div className="p-4">
          <DataTable
            caption="Execution items"
            columns={columns}
            rows={items}
            rowKey={(i) => i.id}
            searchable
            searchPlaceholder="Filter by title or owner…"
            filterRow={(i, q) => `${i.title} ${i.owner}`.toLowerCase().includes(q.toLowerCase())}
            initialSortKey="priority"
          />
        </div>
      </Panel>
    </div>
  );
}
