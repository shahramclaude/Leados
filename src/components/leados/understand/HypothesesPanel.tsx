"use client";

import { useState } from "react";
import { Badge, StatusBadge } from "@/components/leados/ui/Badge";
import { DataTable, type DataTableColumn } from "@/components/leados/ui/DataTable";
import { Drawer } from "@/components/leados/ui/Drawer";
import { ProgressBar } from "@/components/leados/ui/Metrics";
import { formatDate } from "@/lib/format";
import type { Status } from "@/components/leados/ui/tokens";

export interface HypothesisRow {
  id: number;
  statement: string;
  status: string;
  confidence: number;
  owner: string;
  evidenceCount: number;
  updatedAt: string;
}

const STATUS_TONE: Record<string, Status> = { testing: "info", validated: "success", invalidated: "danger" };

export function HypothesesPanel({ items }: { items: HypothesisRow[] }) {
  const [selected, setSelected] = useState<HypothesisRow | null>(null);

  const columns: DataTableColumn<HypothesisRow>[] = [
    { key: "statement", header: "Hypothesis", render: (h) => <span className="font-medium">{h.statement}</span>, sortValue: (h) => h.statement, filterValue: (h) => `${h.statement} ${h.owner}` },
    { key: "status", header: "Status", render: (h) => <StatusBadge status={STATUS_TONE[h.status] ?? "neutral"} />, sortValue: (h) => h.status },
    { key: "confidence", header: "Confidence", render: (h) => <ProgressBar value={h.confidence} />, sortValue: (h) => h.confidence },
    { key: "owner", header: "Owner", render: (h) => h.owner, sortValue: (h) => h.owner },
    { key: "evidence", header: "Evidence", numeric: true, render: (h) => h.evidenceCount, sortValue: (h) => h.evidenceCount },
  ];

  return (
    <>
      <DataTable caption="Hypotheses" rows={items} rowId={(h) => String(h.id)} columns={columns} onRowActivate={setSelected} searchPlaceholder="Filter hypotheses…" />
      <Drawer open={Boolean(selected)} onClose={() => setSelected(null)} title="Hypothesis detail">
        {selected ? (
          <div className="flex flex-col gap-4 text-sm">
            <p className="max-w-[60ch] text-text-primary">{selected.statement}</p>
            <div className="flex flex-wrap gap-2">
              <StatusBadge status={STATUS_TONE[selected.status] ?? "neutral"} />
              <Badge>{selected.evidenceCount} evidence items</Badge>
            </div>
            <dl className="grid grid-cols-2 gap-3">
              <div>
                <dt className="text-xs text-text-muted">Owner</dt>
                <dd className="text-text-primary">{selected.owner}</dd>
              </div>
              <div>
                <dt className="text-xs text-text-muted">Updated</dt>
                <dd className="text-text-primary">{formatDate(selected.updatedAt)}</dd>
              </div>
            </dl>
          </div>
        ) : null}
      </Drawer>
    </>
  );
}
