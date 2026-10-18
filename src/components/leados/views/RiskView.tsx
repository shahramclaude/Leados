"use client";

import PageHeader from "../ui/PageHeader";
import Panel from "../ui/Panel";
import Badge from "../ui/Badge";
import ProgressRing from "../ui/ProgressRing";
import useSimulatedLoad from "../ui/useSimulatedLoad";
import { riskCategories } from "@/lib/leados/data";
import { domainLabel, severityColor } from "../ui/tokens";

export default function RiskView() {
  const loading = useSimulatedLoad();
  const amplified = riskCategories.filter((r) => r.exposure >= 55);

  return (
    <div>
      <PageHeader title="Risk Register" subtitle="All 8 categories, always visible, with cross-domain amplification." />

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="skeleton h-36 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {riskCategories.map((r) => (
            <Panel key={r.id} dense>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <span className="font-data" style={{ color: "var(--text-tertiary)", fontSize: "var(--fs-xs)" }}>{r.id}</span>
                  <p className="mt-0.5 font-medium" style={{ color: "var(--text-primary)", fontSize: "var(--fs-sm)" }}>{r.name}</p>
                </div>
                <ProgressRing value={r.exposure} size="sm" color={severityColor[r.severity]} />
              </div>
              <p className="mt-2" style={{ color: "var(--text-secondary)", fontSize: "var(--fs-xs)" }}>{r.description}</p>
              <div className="mt-3 flex items-center justify-between">
                <Badge variant={r.domain} size="sm" label={domainLabel[r.domain]} />
                <Badge variant={r.severity} size="sm" />
              </div>
            </Panel>
          ))}
        </div>
      )}

      <Panel title="Cross-Domain Amplification" subtitle="Risks with exposure ≥ 55, likely to compound across domains" className="mt-4">
        {amplified.length === 0 ? (
          <p className="py-6 text-center" style={{ color: "var(--text-tertiary)", fontSize: "var(--fs-sm)" }}>
            No amplification chains currently detected.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {amplified.map((r) => (
              <li key={r.id} className="flex items-center justify-between rounded-lg border p-3" style={{ borderColor: "var(--border-subtle)" }}>
                <div className="flex items-center gap-2">
                  <Badge variant={r.domain} size="sm" label={domainLabel[r.domain]} />
                  <span style={{ color: "var(--text-primary)", fontSize: "var(--fs-sm)" }}>{r.name}</span>
                </div>
                <span className="font-data" style={{ color: severityColor[r.severity], fontSize: "var(--fs-sm)" }}>
                  {r.exposure}% exposure
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
