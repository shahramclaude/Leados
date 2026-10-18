"use client";

import { useMemo } from "react";
import PageHeader from "../ui/PageHeader";
import Panel from "../ui/Panel";
import StatTile from "../ui/StatTile";
import Badge from "../ui/Badge";
import GaugeArc from "../ui/GaugeArc";
import useSimulatedLoad from "../ui/useSimulatedLoad";
import { findings, metrics, decisions, compositeHealth } from "@/lib/leados/data";
import { domainLabel } from "../ui/tokens";

export default function NowView() {
  const loading = useSimulatedLoad();
  const { composite, byDomain } = useMemo(() => compositeHealth(), []);
  const urgent = findings.filter((f) => (f.severity === "sev5" || f.severity === "sev4") && f.status !== "resolved");
  const openFindings = findings.filter((f) => f.status !== "resolved");
  const critical = findings.filter((f) => f.severity === "sev5" && f.status !== "resolved");

  return (
    <div>
      <PageHeader
        title="Now"
        subtitle="Attention surface — findings at severity 4+ that need a decision today."
        actions={
          <>
            <button
              className="rounded-lg border px-3 py-1.5 font-medium transition-colors focus-visible:outline-none"
              style={{ borderColor: "var(--border-default)", color: "var(--text-secondary)", fontSize: "var(--fs-sm)" }}
            >
              Run scenario preset
            </button>
            <button
              className="rounded-lg px-3 py-1.5 font-medium transition-colors focus-visible:outline-none"
              style={{ backgroundColor: "var(--accent-blue)", color: "#fff", fontSize: "var(--fs-sm)" }}
            >
              New decision
            </button>
          </>
        }
      />

      {loading ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton h-28 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatTile label="Composite Health" value={composite} unit="/100" status="green" deltaDir="up" delta="2.4" sparklineData={[70, 72, 71, 74, 76, 75, 78]} tooltip="Weighted average across all five domains." />
          <StatTile label="Open Findings" value={openFindings.length} status="yellow" deltaDir="flat" delta="0" />
          <StatTile label="Critical Findings" value={critical.length} status="red" deltaDir="up" delta={critical.length > 0 ? "+1" : "0"} />
          <StatTile label="Pending Decisions" value={decisions.filter((d) => d.status === "pending").length} status="yellow" deltaDir="flat" delta="0" />
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-[2fr_1fr]">
        <Panel title="Needs Attention" subtitle={`${urgent.length} findings at sev4+`} dense>
          {loading ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="skeleton h-16 rounded-lg" />
              ))}
            </div>
          ) : urgent.length === 0 ? (
            <p className="py-6 text-center" style={{ color: "var(--text-tertiary)", fontSize: "var(--fs-sm)" }}>
              No sev4+ findings open right now.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {urgent.map((f) => (
                <li
                  key={f.id}
                  className="flex items-start justify-between gap-3 rounded-lg border p-3"
                  style={{ borderColor: "var(--border-default)", backgroundColor: "var(--bg-surface)" }}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge variant={f.severity} size="sm" />
                      <span className="font-data" style={{ color: "var(--text-tertiary)", fontSize: "var(--fs-xs)" }}>
                        {f.id}
                      </span>
                    </div>
                    <p className="mt-1.5 font-medium" style={{ color: "var(--text-primary)", fontSize: "var(--fs-sm)" }}>
                      {f.title}
                    </p>
                    <p className="mt-1" style={{ color: "var(--text-secondary)", fontSize: "var(--fs-xs)" }}>
                      {f.summary}
                    </p>
                  </div>
                  <span style={{ color: "var(--text-tertiary)", fontSize: "var(--fs-xs)" }} className="shrink-0">
                    {f.owner}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Domain Snapshot" subtitle="Composite score by domain" dense>
          <div className="grid grid-cols-2 gap-2">
            {byDomain.map((d) => (
              <div key={d.domain} className="flex flex-col items-center rounded-lg border p-2" style={{ borderColor: "var(--border-subtle)" }}>
                <GaugeArc value={d.score} size={104} />
                <span className="mt-1 truncate text-center" style={{ color: "var(--text-secondary)", fontSize: "var(--fs-xs)" }}>
                  {domainLabel[d.domain]}
                </span>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}
