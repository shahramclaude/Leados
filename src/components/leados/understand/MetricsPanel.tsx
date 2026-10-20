"use client";

import { useState } from "react";
import { Badge } from "@/components/leados/ui/Badge";
import { DataTable, type DataTableColumn } from "@/components/leados/ui/DataTable";
import { Drawer } from "@/components/leados/ui/Drawer";
import { ProgressBar } from "@/components/leados/ui/Metrics";
import { ChartFrame } from "@/components/leados/charts/ChartFrame";
import { LineSVG } from "@/components/leados/charts/LineSVG";
import { formatCurrency, formatDate, formatNumber } from "@/lib/format";

export interface MetricRow {
  id: number;
  name: string;
  category: string;
  unit: string;
  value: string;
  target: string;
  p10: string;
  p50: string;
  p90: string;
  series: { t: string; v: number }[];
  updatedAt: string;
}

function formatByUnit(unit: string, value: number) {
  if (unit === "USD") return formatCurrency(value);
  if (unit === "%") return `${value.toFixed(1)}%`;
  return formatNumber(value);
}

export function MetricsPanel({ metrics }: { metrics: MetricRow[] }) {
  const [selected, setSelected] = useState<MetricRow | null>(null);

  const columns: DataTableColumn<MetricRow>[] = [
    { key: "name", header: "Metric", render: (m) => <span className="font-medium">{m.name}</span>, sortValue: (m) => m.name, filterValue: (m) => `${m.name} ${m.category}` },
    { key: "category", header: "Category", render: (m) => <Badge>{m.category}</Badge>, sortValue: (m) => m.category },
    { key: "value", header: "Value", numeric: true, render: (m) => formatByUnit(m.unit, Number(m.value)), sortValue: (m) => Number(m.value) },
    { key: "target", header: "Target", numeric: true, render: (m) => formatByUnit(m.unit, Number(m.target)), sortValue: (m) => Number(m.target) },
    {
      key: "progress",
      header: "To target",
      render: (m) => <ProgressBar value={Math.min(Number(m.value), Number(m.target))} max={Number(m.target) || 1} />,
    },
  ];

  const band = selected
    ? (() => {
        const value = Number(selected.value) || 1;
        const ratio = (Number(selected.p90) - Number(selected.p10)) / (2 * value || 1);
        return selected.series.map((point) => ({
          t: point.t,
          v: point.v,
          p10: point.v * (1 - Math.abs(ratio)),
          p90: point.v * (1 + Math.abs(ratio)),
        }));
      })()
    : [];

  return (
    <>
      <DataTable caption="Metrics" rows={metrics} rowId={(m) => String(m.id)} columns={columns} onRowActivate={setSelected} searchPlaceholder="Filter metrics…" />
      <Drawer open={Boolean(selected)} onClose={() => setSelected(null)} title={selected?.name ?? ""}>
        {selected ? (
          <div className="flex flex-col gap-4">
            <dl className="grid grid-cols-3 gap-3 text-sm">
              <div>
                <dt className="text-xs text-text-muted">p10</dt>
                <dd className="font-mono tabular-nums text-text-primary">{formatByUnit(selected.unit, Number(selected.p10))}</dd>
              </div>
              <div>
                <dt className="text-xs text-text-muted">p50</dt>
                <dd className="font-mono tabular-nums text-text-primary">{formatByUnit(selected.unit, Number(selected.p50))}</dd>
              </div>
              <div>
                <dt className="text-xs text-text-muted">p90</dt>
                <dd className="font-mono tabular-nums text-text-primary">{formatByUnit(selected.unit, Number(selected.p90))}</dd>
              </div>
            </dl>
            <ChartFrame
              title={`${selected.name} — 14 day trend`}
              description="Shaded band shows the derived p10-p90 credible range around each daily point."
              sourceNote={`Last updated ${formatDate(selected.updatedAt)}. Source: metrics.series.`}
              tableColumns={[
                { key: "t", label: "Date" },
                { key: "v", label: "Value", numeric: true },
                { key: "p10", label: "p10", numeric: true },
                { key: "p90", label: "p90", numeric: true },
              ]}
              tableRows={band.map((b) => ({ t: b.t, v: b.v.toFixed(1), p10: b.p10.toFixed(1), p90: b.p90.toFixed(1) }))}
            >
              <LineSVG series={[{ id: selected.name, label: selected.name, points: band }]} width={420} height={220} yLabel={selected.unit} />
            </ChartFrame>
          </div>
        ) : null}
      </Drawer>
    </>
  );
}
