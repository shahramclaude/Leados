import { PageHeader, Panel, Badge, ProgressBar } from "@/components/leados/ui";
import { DataTable, type ColumnDef } from "@/components/leados/ui/Table";
import { generateHypotheses, type Hypothesis } from "@/lib/engine";
import { formatPercent } from "@/components/leados/ui/utils";
import type { Severity } from "@/components/leados/ui/tokens";

export const dynamic = "force-dynamic";

const statusSeverity: Record<Hypothesis["status"], Severity> = {
  testing: "caution",
  supported: "good",
  refuted: "critical",
};

export default function HypothesesPage() {
  const hypotheses = generateHypotheses();
  const supported = hypotheses.filter((h) => h.status === "supported").length;
  const testing = hypotheses.filter((h) => h.status === "testing").length;

  const columns: ColumnDef<Hypothesis>[] = [
    { key: "statement", header: "Hypothesis", render: (h) => h.statement, sortValue: (h) => h.statement },
    {
      key: "confidence",
      header: "Confidence",
      render: (h) => <ProgressBar value={h.confidence * 100} severity={h.confidence > 0.7 ? "good" : h.confidence > 0.45 ? "caution" : "warning"} />,
      sortValue: (h) => h.confidence,
      width: "180px",
    },
    { key: "evidence", header: "Evidence points", render: (h) => h.evidenceCount, sortValue: (h) => h.evidenceCount, align: "right" },
    { key: "status", header: "Status", render: (h) => <Badge severity={statusSeverity[h.status]}>{h.status}</Badge>, sortValue: (h) => h.status },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumbs={[{ label: "LEADOS", href: "/now" }, { label: "Understand" }, { label: "Hypotheses" }]}
        title="Hypotheses"
        description="Standing beliefs about the business, tracked against the evidence that supports or refutes them."
      />

      <Panel padded={false}>
        <div className="grid grid-cols-1 divide-y divide-border-subtle sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <div className="p-4">
            <p className="text-caption uppercase tracking-wide text-text-tertiary">Total hypotheses</p>
            <p className="mt-1 text-h3 font-semibold text-text-primary">{hypotheses.length}</p>
          </div>
          <div className="p-4">
            <p className="text-caption uppercase tracking-wide text-text-tertiary">Supported</p>
            <p className="mt-1 text-h3 font-semibold text-severity-good">{supported}</p>
          </div>
          <div className="p-4">
            <p className="text-caption uppercase tracking-wide text-text-tertiary">Still testing</p>
            <p className="mt-1 text-h3 font-semibold text-severity-caution">{testing}</p>
          </div>
        </div>
      </Panel>

      <Panel title="All hypotheses" padded={false}>
        <div className="p-4">
          <DataTable
            caption="Hypotheses"
            columns={columns}
            rows={hypotheses}
            rowKey={(h) => h.id}
            searchable
            searchPlaceholder="Filter hypotheses…"
            filterRow={(h, q) => h.statement.toLowerCase().includes(q.toLowerCase())}
            initialSortKey="confidence"
          />
        </div>
      </Panel>
    </div>
  );
}
