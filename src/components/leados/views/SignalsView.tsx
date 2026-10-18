"use client";

import { useState } from "react";
import PageHeader from "../ui/PageHeader";
import Panel from "../ui/Panel";
import Badge from "../ui/Badge";
import DataTable, { type ColDef } from "../ui/DataTable";
import ErrorState from "../ui/ErrorState";
import useSimulatedLoad from "../ui/useSimulatedLoad";
import { findings, type Finding } from "@/lib/leados/data";
import { domainLabel, type DomainKey } from "../ui/tokens";

const domainFilters: Array<DomainKey | "all"> = [
  "all",
  "domain-people",
  "domain-finance",
  "domain-sales",
  "domain-ops",
  "domain-strategy",
];

const columns: ColDef<Finding>[] = [
  { key: "id", label: "ID", sortable: true, width: "90px", render: (v) => <span className="font-data">{String(v)}</span> },
  { key: "title", label: "Finding", sortable: true },
  {
    key: "domain",
    label: "Domain",
    sortable: true,
    render: (v) => <Badge variant={v as DomainKey} size="sm" label={domainLabel[v as DomainKey]} />,
  },
  {
    key: "severity",
    label: "Severity",
    sortable: true,
    render: (v) => <Badge variant={v as Finding["severity"]} size="sm" />,
  },
  { key: "recurrence", label: "Recurrence", sortable: true, align: "right" },
  { key: "owner", label: "Owner", sortable: true },
  { key: "status", label: "Status", sortable: true, render: (v) => <span className="capitalize">{String(v)}</span> },
];

export default function SignalsView() {
  const loading = useSimulatedLoad();
  const [domainFilter, setDomainFilter] = useState<DomainKey | "all">("all");
  const [simulateError, setSimulateError] = useState(false);

  const rows = domainFilter === "all" ? findings : findings.filter((f) => f.domain === domainFilter);

  return (
    <div>
      <PageHeader
        title="Signal Board"
        subtitle="Full catalog of active and resolved findings across every domain."
        actions={
          <button
            onClick={() => setSimulateError((v) => !v)}
            className="rounded-lg border px-3 py-1.5 font-medium transition-colors focus-visible:outline-none"
            style={{ borderColor: "var(--border-default)", color: "var(--text-secondary)", fontSize: "var(--fs-sm)" }}
          >
            {simulateError ? "Dismiss demo error" : "Simulate error (demo)"}
          </button>
        }
      />

      <div className="mb-4 flex flex-wrap gap-1.5">
        {domainFilters.map((d) => (
          <button
            key={d}
            onClick={() => setDomainFilter(d)}
            className="rounded-full border px-3 py-1 capitalize transition-colors focus-visible:outline-none"
            style={{
              fontSize: "var(--fs-xs)",
              borderColor: domainFilter === d ? "var(--accent-blue)" : "var(--border-default)",
              color: domainFilter === d ? "var(--text-primary)" : "var(--text-secondary)",
              backgroundColor: domainFilter === d ? "color-mix(in srgb, var(--accent-blue) 16%, transparent)" : "transparent",
            }}
          >
            {d === "all" ? "All domains" : domainLabel[d]}
          </button>
        ))}
      </div>

      <Panel title="Findings" subtitle={`${rows.length} rule matches`}>
        {simulateError ? (
          <ErrorState message="Unable to reach the signal engine. The connection timed out." onRetry={() => setSimulateError(false)} />
        ) : (
          <DataTable columns={columns} rows={rows} loading={loading} getRowId={(r) => r.id} emptyLabel="No findings match this filter." />
        )}
      </Panel>
    </div>
  );
}
