"use client";

import { useState } from "react";
import { Badge } from "@/components/leados/ui/Badge";
import { DataTable, type DataTableColumn } from "@/components/leados/ui/DataTable";
import { Drawer } from "@/components/leados/ui/Drawer";
import { ProgressBar } from "@/components/leados/ui/Metrics";
import { formatDate } from "@/lib/format";

export interface KnowledgeRow {
  id: number;
  title: string;
  summary: string;
  tag: string;
  confidence: number;
  updatedAt: string;
}

export function KnowledgePanel({ items }: { items: KnowledgeRow[] }) {
  const [selected, setSelected] = useState<KnowledgeRow | null>(null);

  const columns: DataTableColumn<KnowledgeRow>[] = [
    { key: "title", header: "Finding", render: (k) => <span className="font-medium">{k.title}</span>, sortValue: (k) => k.title, filterValue: (k) => `${k.title} ${k.tag} ${k.summary}` },
    { key: "tag", header: "Area", render: (k) => <Badge>{k.tag}</Badge>, sortValue: (k) => k.tag },
    { key: "confidence", header: "Confidence", render: (k) => <ProgressBar value={k.confidence} />, sortValue: (k) => k.confidence },
    { key: "updated", header: "Updated", render: (k) => formatDate(k.updatedAt), sortValue: (k) => k.updatedAt },
  ];

  return (
    <>
      <DataTable caption="Knowledge" rows={items} rowId={(k) => String(k.id)} columns={columns} onRowActivate={setSelected} searchPlaceholder="Filter knowledge…" />
      <Drawer open={Boolean(selected)} onClose={() => setSelected(null)} title={selected?.title ?? ""}>
        {selected ? (
          <div className="flex flex-col gap-4 text-sm">
            <div className="flex flex-wrap gap-2">
              <Badge>{selected.tag}</Badge>
              <Badge tone="accent">{selected.confidence}% confidence</Badge>
            </div>
            <p className="max-w-[60ch] text-text-secondary">{selected.summary}</p>
            <p className="text-xs text-text-muted">Updated {formatDate(selected.updatedAt)}</p>
          </div>
        ) : null}
      </Drawer>
    </>
  );
}
