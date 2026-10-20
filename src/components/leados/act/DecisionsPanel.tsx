"use client";

import { useState } from "react";
import { Badge, SeverityBadge, StatusBadge } from "@/components/leados/ui/Badge";
import { Button } from "@/components/leados/ui/Button";
import { DataTable, type DataTableColumn } from "@/components/leados/ui/DataTable";
import { Drawer } from "@/components/leados/ui/Drawer";
import { useToast } from "@/components/leados/ui/Toast";
import { useUndoRedo } from "@/components/leados/app/UndoRedoProvider";
import { formatCurrency, formatDate } from "@/lib/format";
import type { Severity, Status } from "@/components/leados/ui/tokens";

export interface DecisionRow {
  id: number;
  title: string;
  description: string;
  track: string;
  category: string;
  status: string;
  owner: string;
  severity: number;
  financialImpact: string;
  dueDate: string;
  createdAt: string;
  decidedAt: string | null;
}

const STATUS_TONE: Record<string, Status> = { pending: "warning", approved: "success", rejected: "danger", scheduled: "info" };

export function DecisionsPanel({ decisions, emptyLabel = "decisions" }: { decisions: DecisionRow[]; emptyLabel?: string }) {
  const [rows, setRows] = useState(decisions);
  const [selected, setSelected] = useState<DecisionRow | null>(null);
  const { notify } = useToast();
  const { push } = useUndoRedo();

  async function setStatus(decision: DecisionRow, status: string) {
    const previousStatus = decision.status;
    setRows((prev) => prev.map((row) => (row.id === decision.id ? { ...row, status } : row)));
    setSelected((prev) => (prev && prev.id === decision.id ? { ...prev, status } : prev));

    async function apply(nextStatus: string) {
      const res = await fetch(`/api/decisions/${decision.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (!res.ok) throw new Error("request-failed");
    }

    try {
      await apply(status);
      notify({ title: `Decision ${status}`, description: decision.title, tone: status === "rejected" ? "warning" : "success" });
      push({
        label: `Set "${decision.title}" to ${status}`,
        undo: async () => {
          await apply(previousStatus);
          setRows((prev) => prev.map((row) => (row.id === decision.id ? { ...row, status: previousStatus } : row)));
        },
        redo: async () => {
          await apply(status);
          setRows((prev) => prev.map((row) => (row.id === decision.id ? { ...row, status } : row)));
        },
      });
    } catch {
      setRows((prev) => prev.map((row) => (row.id === decision.id ? { ...row, status: previousStatus } : row)));
      notify({ title: "Couldn't update decision", tone: "danger", politeness: "assertive" });
    }
  }

  const columns: DataTableColumn<DecisionRow>[] = [
    { key: "title", header: "Decision", render: (d) => <span className="font-medium">{d.title}</span>, sortValue: (d) => d.title, filterValue: (d) => `${d.title} ${d.owner} ${d.category}` },
    { key: "category", header: "Category", render: (d) => <Badge>{d.category}</Badge>, sortValue: (d) => d.category },
    { key: "status", header: "Status", render: (d) => <StatusBadge status={STATUS_TONE[d.status] ?? "neutral"} />, sortValue: (d) => d.status },
    { key: "severity", header: "Severity", render: (d) => <SeverityBadge level={d.severity as Severity} />, sortValue: (d) => d.severity },
    { key: "owner", header: "Owner", render: (d) => d.owner, sortValue: (d) => d.owner },
    { key: "impact", header: "Impact", numeric: true, render: (d) => formatCurrency(d.financialImpact), sortValue: (d) => Number(d.financialImpact) },
    { key: "due", header: "Due", render: (d) => formatDate(d.dueDate), sortValue: (d) => d.dueDate },
  ];

  return (
    <>
      <DataTable caption={`${emptyLabel} table`} rows={rows} rowId={(d) => String(d.id)} columns={columns} onRowActivate={setSelected} searchPlaceholder={`Filter ${emptyLabel}…`} emptyDescription={`No ${emptyLabel} match these filters yet.`} />
      <Drawer open={Boolean(selected)} onClose={() => setSelected(null)} title={selected?.title ?? ""}>
        {selected ? (
          <div className="flex flex-col gap-4 text-sm">
            <div className="flex flex-wrap gap-2">
              <StatusBadge status={STATUS_TONE[selected.status] ?? "neutral"} />
              <SeverityBadge level={selected.severity as Severity} />
              <Badge>{selected.track}</Badge>
            </div>
            <p className="max-w-[60ch] text-text-secondary">{selected.description}</p>
            <dl className="grid grid-cols-2 gap-3">
              <div>
                <dt className="text-xs text-text-muted">Owner</dt>
                <dd className="text-text-primary">{selected.owner}</dd>
              </div>
              <div>
                <dt className="text-xs text-text-muted">Due</dt>
                <dd className="text-text-primary">{formatDate(selected.dueDate)}</dd>
              </div>
              <div>
                <dt className="text-xs text-text-muted">Financial impact</dt>
                <dd className="font-mono tabular-nums text-text-primary">{formatCurrency(selected.financialImpact)}</dd>
              </div>
            </dl>
            {selected.status === "pending" ? (
              <div className="flex gap-2 pt-2">
                <Button onClick={() => setStatus(selected, "approved")}>Approve</Button>
                <Button variant="danger" onClick={() => setStatus(selected, "rejected")}>
                  Reject
                </Button>
              </div>
            ) : (
              <p className="text-xs text-text-muted">Already {selected.status}.</p>
            )}
          </div>
        ) : null}
      </Drawer>
    </>
  );
}
