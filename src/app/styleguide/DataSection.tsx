"use client";

import { useState } from "react";
import { DataTable, type DataTableColumn } from "@/components/data/DataTable";
import { MetricTile } from "@/components/insight/MetricTile";
import { ConfidenceBar } from "@/components/insight/ConfidenceBar";
import { InsightCard } from "@/components/insight/InsightCard";
import { ScenarioSlider } from "@/components/insight/ScenarioSlider";
import { Sparkline } from "@/components/charts/Sparkline";
import { MiniBarChart } from "@/components/charts/MiniBarChart";
import { Button } from "@/components/ui/Button";
import { CONFIDENCE_LEVELS } from "@/design/tokens";
import { explain } from "@/lib/explain";

interface Row {
  id: string;
  name: string;
  domain: string;
  value: number;
}

const SAMPLE_ROWS: Row[] = Array.from({ length: 40 }).map((_, i) => ({
  id: `row-${i}`,
  name: `Initiative ${i + 1}`,
  domain: ["Strategy", "People", "Finance", "Operations", "Risk", "Knowledge"][i % 6],
  value: Math.round(Math.sin(i) * 500 + 1000),
}));

const COLUMNS: DataTableColumn<Row>[] = [
  { id: "name", header: "Initiative", accessor: (r) => r.name, sortable: true },
  { id: "domain", header: "Domain", accessor: (r) => r.domain, sortable: true },
  { id: "value", header: "Value", accessor: (r) => r.value, sortable: true, numeric: true },
];

function Block({ title, contract, children }: { title: string; contract: string[]; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-4 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] p-4 lg:grid-cols-[1fr_minmax(220px,320px)]">
      <div>
        <h3 className="mb-3 text-[var(--text-base)] font-semibold text-[var(--text-primary)]">{title}</h3>
        {children}
      </div>
      <div className="rounded-[var(--radius-md)] bg-[var(--surface-sunken)] p-3">
        <p className="mb-1 text-[var(--text-xs)] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Behavior contract</p>
        <ul className="list-disc space-y-1 pl-4 text-[var(--text-sm)] text-[var(--text-secondary)]">
          {contract.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function DataSection() {
  const [dataTableState, setDataTableState] = useState<"data" | "loading" | "error" | "empty">("data");

  const demoInsight = explain(1, {
    claim: "Operations throughput is flat week-over-week; one upstream dependency is the likely bottleneck.",
    confidence: "modeled",
    evidence: [
      { id: "a", label: "Throughput log" },
      { id: "b", label: "Dependency graph" },
    ],
    method: "Bottleneck detection via queueing-theory utilization on the dependency graph.",
    caveats: ["Dependency graph last verified 3 weeks ago."],
  });

  return (
    <div className="flex flex-col gap-6">
      <Block
        title="DataTable — sortable / filterable / virtualized / keyboard grid"
        contract={[
          "loading -> skeleton rows, header stays sticky and visible.",
          "error -> inline message + Retry; filter text preserved.",
          "empty (post-filter) -> \"No rows match …\" + Clear filter action.",
          "ArrowUp/Down/Left/Right move the active cell; roving tabindex.",
          "viewportHeight enables windowing (only visible rows + overscan mount).",
        ]}
      >
        <div className="mb-3 flex gap-2">
          {(["data", "loading", "error", "empty"] as const).map((s) => (
            <Button key={s} size="sm" variant={dataTableState === s ? "primary" : "secondary"} onClick={() => setDataTableState(s)}>
              {s}
            </Button>
          ))}
        </div>
        <DataTable
          caption="Styleguide demo table"
          columns={COLUMNS}
          rows={dataTableState === "empty" ? [] : SAMPLE_ROWS}
          rowKey={(r) => r.id}
          density="comfortable"
          viewportHeight={260}
          loading={dataTableState === "loading"}
          error={dataTableState === "error" ? "Could not load initiatives (HTTP 503)." : undefined}
          onRetry={() => setDataTableState("data")}
        />
      </Block>

      <Block title="ConfidenceBar — all 5 steps + interval whiskers" contract={["Always text label + glyph, never color alone.", "Interval whiskers share the same horizontal scale as the point estimate."]}>
        <div className="flex flex-col gap-4">
          {CONFIDENCE_LEVELS.map((level) => (
            <ConfidenceBar key={level.id} level={level.id} />
          ))}
          <ConfidenceBar level="modeled" interval={{ low: 0.3, high: 0.7, point: 0.52 }} />
        </div>
      </Block>

      <Block title="InsightCard — claim + confidence + evidence + Explain drawer" contract={["Explain drawer is always a superset of the card.", "Evidence chips cap at 4 visible + overflow badge."]}>
        <InsightCard title="Operations throughput" insight={demoInsight} className="max-w-md" />
      </Block>

      <Block title="MetricTile — default + loading" contract={["All numerals use tabular-nums via [data-metric].", "Comparison color is redundant with +/− sign and label text."]}>
        <div className="flex flex-wrap gap-4">
          <MetricTile label="Active workspaces" value="1,204" comparison={{ value: 0.06, label: "WoW" }} trend={[10, 12, 11, 14, 16, 15, 18]} />
          <MetricTile label="Loading example" value="" loading />
        </div>
      </Block>

      <Block title="ScenarioSlider — live delta preview" contract={["input[type=range] keeps native keyboard support.", "Delta is announced via a debounced polite live region while dragging."]}>
        <ScenarioSlider
          label="Headcount growth"
          min={-10}
          max={30}
          defaultValue={5}
          baseline={5}
          unit="%"
          outcomeLabel="Projected runway"
          project={(v) => 17.2 - v * 0.18}
          className="max-w-sm"
        />
      </Block>

      <Block title="Sparkline + MiniBarChart" contract={["Position/length encode value; color is identity only (Cleveland–McGill).", "No gridlines/axes on sparklines — data-ink ratio target >= 0.6."]}>
        <div className="flex flex-wrap items-end gap-6">
          <Sparkline data={[4, 6, 5, 8, 9, 7, 10, 12]} ariaLabel="Example trend" comparisonValue={7} />
          <MiniBarChart ariaLabel="Example comparison" data={[{ label: "A", value: 40 }, { label: "B", value: 65 }, { label: "C", value: 52 }]} />
        </div>
      </Block>
    </div>
  );
}
