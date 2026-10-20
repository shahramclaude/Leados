"use client";

import { useState } from "react";
import { Badge, SeverityBadge } from "@/components/leados/ui/Badge";
import { DataTable, type DataTableColumn } from "@/components/leados/ui/DataTable";
import { Drawer } from "@/components/leados/ui/Drawer";
import { formatDate, formatPercent } from "@/lib/format";
import type { Severity } from "@/components/leados/ui/tokens";

export interface SignalRow {
  id: number;
  label: string;
  category: string;
  severity: number;
  trend: string;
  value: string;
  changePct: string;
  detectedAt: string;
  source: string;
}

const TREND_GLYPH: Record<string, string> = { up: "▲", down: "▼", flat: "■" };

export function SignalsPanel({ signals }: { signals: SignalRow[] }) {
  const [selected, setSelected] = useState<SignalRow | null>(null);

  const columns: DataTableColumn<SignalRow>[] = [
    { key: "label", header: "Signal", render: (s) => <span className="font-medium">{s.label}</span>, sortValue: (s) => s.label, filterValue: (s) => `${s.label} ${s.category}` },
    { key: "category", header: "Category", render: (s) => <Badge>{s.category}</Badge>, sortValue: (s) => s.category },
    { key: "severity", header: "Severity", render: (s) => <SeverityBadge level={s.severity as Severity} />, sortValue: (s) => s.severity },
    {
      key: "trend",
      header: "Trend",
      render: (s) => (
        <span className="inline-flex items-center gap-1">
          <span aria-hidden="true">{TREND_GLYPH[s.trend]}</span>
          {s.trend}
        </span>
      ),
      sortValue: (s) => s.trend,
    },
    { key: "change", header: "Change", numeric: true, render: (s) => formatPercent(s.changePct), sortValue: (s) => Number(s.changePct) },
  ];

  return (
    <>
      <DataTable caption="Signals" rows={signals} rowId={(s) => String(s.id)} columns={columns} onRowActivate={setSelected} searchPlaceholder="Filter signals…" />
      <Drawer open={Boolean(selected)} onClose={() => setSelected(null)} title={selected?.label ?? ""}>
        {selected ? (
          <div className="flex flex-col gap-4 text-sm">
            <div className="flex flex-wrap gap-2">
              <SeverityBadge level={selected.severity as Severity} />
              <Badge>{selected.category}</Badge>
            </div>
            <dl className="grid grid-cols-2 gap-3">
              <div>
                <dt className="text-xs text-text-muted">Value</dt>
                <dd className="font-mono tabular-nums text-text-primary">{selected.value}</dd>
              </div>
              <div>
                <dt className="text-xs text-text-muted">Change</dt>
                <dd className="font-mono tabular-nums text-text-primary">{formatPercent(selected.changePct)}</dd>
              </div>
              <div>
                <dt className="text-xs text-text-muted">Detected</dt>
                <dd className="text-text-primary">{formatDate(selected.detectedAt)}</dd>
              </div>
              <div>
                <dt className="text-xs text-text-muted">Source</dt>
                <dd className="text-text-primary">{selected.source}</dd>
              </div>
            </dl>
          </div>
        ) : null}
      </Drawer>
    </>
  );
}
