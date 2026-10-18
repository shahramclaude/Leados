"use client";

import { useMemo } from "react";
import PageHeader from "../ui/PageHeader";
import Panel from "../ui/Panel";
import Badge from "../ui/Badge";
import useSimulatedLoad from "../ui/useSimulatedLoad";
import { findings, playbooks } from "@/lib/leados/data";
import { domainLabel } from "../ui/tokens";

export default function CasView() {
  const loading = useSimulatedLoad();

  const attractors = useMemo(() => findings.filter((f) => f.recurrence >= 3), []);
  const bifurcations = useMemo(() => findings.filter((f) => f.severity === "sev5" || f.severity === "sev4"), []);

  const loops = [
    { id: "L-01", type: "reinforcing" as const, description: "Attrition risk → coverage gaps → overtime → further attrition.", domain: findings[0].domain },
    { id: "L-02", type: "balancing" as const, description: "Margin compression triggers pricing review which restores margin.", domain: findings[1].domain },
    { id: "L-03", type: "reinforcing" as const, description: "SLA breaches erode trust, reducing vendor responsiveness.", domain: findings[3].domain },
  ];

  return (
    <div>
      <PageHeader title="CAS Engine" subtitle="Feedback loops, bifurcation points, and recurrence-based attractors." />

      {loading ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="skeleton h-56 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Panel title="Feedback Loops" subtitle={`${loops.length} tracked`} dense>
            <ul className="flex flex-col gap-2">
              {loops.map((loop) => (
                <li key={loop.id} className="rounded-lg border p-3" style={{ borderColor: "var(--border-subtle)" }}>
                  <div className="flex items-center justify-between">
                    <span className="font-data" style={{ color: "var(--text-tertiary)", fontSize: "var(--fs-xs)" }}>{loop.id}</span>
                    <Badge
                      variant="neutral"
                      size="sm"
                      dot={false}
                      label={loop.type === "reinforcing" ? "Reinforcing" : "Balancing"}
                    />
                  </div>
                  <p className="mt-2" style={{ color: "var(--text-primary)", fontSize: "var(--fs-sm)" }}>{loop.description}</p>
                  <div className="mt-2">
                    <Badge variant={loop.domain} size="sm" label={domainLabel[loop.domain]} />
                  </div>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="Bifurcation Points" subtitle="Where small changes cascade" dense>
            {bifurcations.length === 0 ? (
              <p className="py-6 text-center" style={{ color: "var(--text-tertiary)", fontSize: "var(--fs-sm)" }}>
                No bifurcation risk detected.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {bifurcations.map((f) => (
                  <li key={f.id} className="flex items-center justify-between rounded-lg border p-3" style={{ borderColor: "var(--border-subtle)" }}>
                    <div className="min-w-0">
                      <p className="truncate" style={{ color: "var(--text-primary)", fontSize: "var(--fs-sm)" }}>{f.title}</p>
                      <span className="font-data" style={{ color: "var(--text-tertiary)", fontSize: "var(--fs-xs)" }}>{f.id}</span>
                    </div>
                    <Badge variant={f.severity} size="sm" />
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Attractors" subtitle="Recurrence ≥ 3" dense>
            {attractors.length === 0 ? (
              <p className="py-6 text-center" style={{ color: "var(--text-tertiary)", fontSize: "var(--fs-sm)" }}>
                No recurring patterns have stabilized into attractors yet.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {attractors.map((f) => (
                  <li key={f.id} className="flex items-center justify-between rounded-lg border p-3" style={{ borderColor: "var(--border-subtle)" }}>
                    <p className="truncate pr-2" style={{ color: "var(--text-primary)", fontSize: "var(--fs-sm)" }}>{f.title}</p>
                    <span className="font-data shrink-0" style={{ color: "var(--accent-indigo)", fontSize: "var(--fs-sm)" }}>
                      ×{f.recurrence}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      )}

      <Panel title="Recommended Playbooks" subtitle="Interventions mapped to active loops" className="mt-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {playbooks.map((pb) => (
            <div key={pb.id} className="rounded-lg border p-3" style={{ borderColor: "var(--border-subtle)", backgroundColor: "var(--bg-surface)" }}>
              <div className="flex items-center justify-between">
                <Badge variant={pb.domain} size="sm" label={domainLabel[pb.domain]} />
                <span className="font-data" style={{ color: "var(--text-tertiary)", fontSize: "var(--fs-xs)" }}>{pb.steps} steps</span>
              </div>
              <p className="mt-2 font-medium" style={{ color: "var(--text-primary)", fontSize: "var(--fs-sm)" }}>{pb.name}</p>
              <p className="mt-1" style={{ color: "var(--text-secondary)", fontSize: "var(--fs-xs)" }}>{pb.description}</p>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
